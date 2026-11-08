// Sync of the data set with Firestore, while signed in.
//
// One document per record, under users/{uid}/:
//   acts/{actId}, entries/{act~YYYY-MM-DD~sid}, notes/{t30}, rounds/{rid}
// A document holds the record as the app stores it (with its timestamp `t`) plus `st`,
// the server time of the last write. The rule is the app's usual one: when two copies
// of a record differ, the one with the most recent `t` wins. Deleted records are kept as
// {deleted: true, t} so the deletion syncs too.
//
// Reads are incremental: listeners only ask for documents written since the last server
// time this device has seen, so opening the app costs a handful of reads, not the whole set.
// `seen` remembers, per record, the `t` the server holds, so only newer records are written.
import { on, emit } from "./bus.js";
import { state, normalize, merge, canon, setData } from "./store.js";
import { account, firebase, currentUser } from "./cloud.js";

const COLLS = {
  acts: (d) => d.acts,
  entries: (d) => d.entries,
  notes: (d) => d.read.notes,
  rounds: (d) => d.read.rounds,
};
const PUSH_DELAY_MS = 1500;
const BATCH_MAX = 400; // Firestore allows 500 writes per batch
const MARGIN_MS = 60000; // re-read the last minute, in case two writes landed close together

/** Status for the UI: state is "", "busy", "ok" or "err"; at is the time of the last success. */
export const cloudStatus = { state: "", at: 0, error: "" };
function setStatus(patch) {
  Object.assign(cloudStatus, patch);
  emit("cloudsync", cloudStatus);
}

let fs = null, // Firestore module
  db = null,
  uid = null,
  meta = null, // {since, seen: {"coll|key": t}}, saved per account
  unsubs = [],
  ready = new Set(), // collections whose first snapshot has arrived
  timer = null,
  chain = Promise.resolve();

const toId = (coll, k) => (coll === "entries" ? k.replace(/\//g, "~") : k);
const fromId = (coll, id) => (coll === "entries" ? id.replace(/~/g, "/") : id);
const metaKey = () => "dp-cloud-" + uid;

function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(metaKey()));
    if (m && typeof m.since === "number" && m.seen && typeof m.seen === "object") return m;
  } catch {
    /* start over */
  }
  return { since: 0, seen: {} };
}
function saveMeta() {
  try {
    localStorage.setItem(metaKey(), JSON.stringify(meta));
  } catch {
    /* full or unavailable: everything is simply re-checked next time */
  }
}

function errorKey(e) {
  const code = (e && e.code) || "";
  if (code === "permission-denied" || code === "unauthenticated") return "rules";
  if (code === "unavailable" || !navigator.onLine) return "offline";
  return "failed";
}
function fail(e) {
  console.error(e);
  setStatus({ state: "err", error: errorKey(e) });
}

async function start() {
  const user = currentUser();
  if (!user || uid === user.uid) return;
  stop();
  uid = user.uid;
  setStatus({ state: "busy", error: "" });
  try {
    const { app } = await firebase();
    fs = fs || (await import("./vendor/firebase/firebase-firestore.js"));
    db = db || fs.getFirestore(app);
  } catch (e) {
    uid = null;
    return fail(e);
  }
  if (!currentUser() || currentUser().uid !== uid) return; // signed out meanwhile
  meta = loadMeta();
  const since = fs.Timestamp.fromMillis(Math.max(0, meta.since - MARGIN_MS));
  for (const coll of Object.keys(COLLS)) {
    const ref = fs.collection(db, "users", uid, coll);
    const q = meta.since ? fs.query(ref, fs.where("st", ">", since)) : ref;
    unsubs.push(
      fs.onSnapshot(
        q,
        (snap) => receive(coll, snap),
        (e) => fail(e),
      ),
    );
  }
}

function stop() {
  unsubs.forEach((u) => u());
  unsubs = [];
  ready.clear();
  clearTimeout(timer);
  uid = null;
  meta = null;
  setStatus({ state: "", error: "" });
}

/** Documents from a listener: validate them like any outside data, then merge. */
function receive(coll, snap) {
  if (!meta) return;
  const part = { acts: {}, entries: {}, read: { notes: {}, rounds: {} } };
  let since = meta.since;
  snap.docChanges().forEach((ch) => {
    if (ch.type === "removed" || ch.doc.metadata.hasPendingWrites) return;
    const v = ch.doc.data({ serverTimestamps: "none" });
    if (v.st && typeof v.st.toMillis === "function") since = Math.max(since, v.st.toMillis());
    delete v.st;
    COLLS[coll](part)[fromId(coll, ch.doc.id)] = v;
  });
  const clean = normalize(part),
    got = COLLS[coll](clean);
  for (const k in got) meta.seen[coll + "|" + k] = got[k].t || 0;
  meta.since = since;
  saveMeta();
  if (Object.keys(got).length) {
    const merged = merge(state.data, clean);
    if (canon(merged) !== canon(state.data)) {
      setData(merged);
      emit("data");
    }
  }
  ready.add(coll);
  if (ready.size === Object.keys(COLLS).length) schedule(0);
}

function schedule(delay = PUSH_DELAY_MS) {
  if (!uid) return;
  clearTimeout(timer);
  timer = setTimeout(() => (chain = chain.then(push, push)), delay);
}

/** Write every record that is newer here than on the server. */
async function push() {
  if (!uid || ready.size < Object.keys(COLLS).length) return;
  const writes = [],
    behind = [];
  for (const coll of Object.keys(COLLS)) {
    const map = COLLS[coll](state.data);
    for (const k in map) {
      const r = map[k],
        known = meta.seen[coll + "|" + k];
      if (known === undefined || (r.t || 0) > known) writes.push([coll, k, r]);
      else if ((r.t || 0) < known) behind.push([coll, k]);
    }
  }
  // The server holds a newer copy than this device (an edit made with a clock running late):
  // fetch it, so this device converges instead of keeping its older copy.
  if (behind.length) await refetch(behind);
  if (!writes.length) return setStatus({ state: "ok", at: Date.now(), error: "" });
  setStatus({ state: "busy", error: "" });
  const me = uid;
  try {
    for (let i = 0; i < writes.length; i += BATCH_MAX) {
      const part = writes.slice(i, i + BATCH_MAX),
        batch = fs.writeBatch(db);
      part.forEach(([coll, k, r]) =>
        batch.set(fs.doc(db, "users", me, coll, toId(coll, k)), Object.assign({}, r, { st: fs.serverTimestamp() })),
      );
      await batch.commit();
      if (uid !== me) return; // signed out meanwhile
      part.forEach(([coll, k, r]) => (meta.seen[coll + "|" + k] = r.t || 0));
      saveMeta();
    }
    setStatus({ state: "ok", at: Date.now(), error: "" });
  } catch (e) {
    fail(e);
  }
}

async function refetch(list) {
  const me = uid;
  try {
    const part = { acts: {}, entries: {}, read: { notes: {}, rounds: {} } };
    const snaps = await Promise.all(list.slice(0, 50).map(([coll, k]) => fs.getDoc(fs.doc(db, "users", me, coll, toId(coll, k)))));
    if (uid !== me) return;
    snaps.forEach((d, i) => {
      if (!d.exists()) return;
      const v = d.data({ serverTimestamps: "none" });
      delete v.st;
      COLLS[list[i][0]](part)[list[i][1]] = v;
    });
    const merged = merge(state.data, normalize(part));
    if (canon(merged) !== canon(state.data)) {
      setData(merged);
      emit("data");
    }
  } catch (e) {
    console.error(e); // not fatal: retried on the next push
  }
}

/** Sync now (the "sync" button); resolves when local changes are written. */
export function syncNow() {
  if (!uid) return Promise.resolve();
  clearTimeout(timer);
  chain = chain.then(push, push);
  return chain;
}

export function initCloudSync() {
  on("account", () => {
    if (account.status === "in") start();
    else if (account.status === "out" && uid) stop();
  });
  // Local edits, and data arriving from the gist sync, are both pushed.
  on("changed", () => schedule());
  on("data", () => schedule());
}
