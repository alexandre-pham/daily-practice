// MIDI recordings in Cloud Storage, while signed in.
//
// Files live at users/{uid}/recordings/{clipId}.mid. A recording is uploaded by the device
// that made it (the only one holding the file); once uploaded, its `cloud` flag is set in
// the session, which syncs, so every device knows the file can be downloaded. Downloads
// happen when a recording is opened, and are then kept in IndexedDB.
import { on, emit } from "./bus.js";
import { state, updateClip, changed } from "./store.js";
import { getClip, putClip, deleteClip } from "./clips.js";
import { account, firebase, currentUser } from "./cloud.js";

const MIDI = "audio/midi";
const LS_DELETE = "dp-cloud-deletes"; // ids whose file still has to be removed from the bucket

let st = null, // Storage module
  storage = null,
  running = false,
  again = false;

/** Uploads waiting on this device, for the UI. */
export const recsStatus = { pending: 0, failed: false };

async function ready() {
  if (!currentUser()) return null;
  const { app } = await firebase();
  st = st || (await import("./vendor/firebase/firebase-storage.js"));
  storage = storage || st.getStorage(app);
  return currentUser();
}
const fileRef = (user, id) => st.ref(storage, "users/" + user.uid + "/recordings/" + id + ".mid");

/** Every MIDI recording of a live session whose file is on this device but not online yet. */
async function toUpload() {
  const list = [];
  for (const key in state.data.entries) {
    const e = state.data.entries[key];
    if (!e || e.deleted || !e.clips) continue;
    for (const c of e.clips) if (c.mime === MIDI && !c.cloud) list.push({ key, c });
  }
  const out = [];
  for (const x of list) {
    try {
      const blob = await getClip(x.c.id);
      if (blob) out.push(Object.assign(x, { blob }));
    } catch {
      /* IndexedDB unavailable */
    }
  }
  return out;
}

async function run() {
  if (running) return void (again = true);
  running = true;
  try {
    do {
      again = false;
      const user = await ready();
      if (!user) break;
      await flushDeletes(user);
      const list = await toUpload();
      recsStatus.pending = list.length;
      recsStatus.failed = false;
      emit("recs");
      let done = 0;
      for (const x of list) {
        if (!currentUser() || currentUser().uid !== user.uid) break;
        try {
          await st.uploadBytes(fileRef(user, x.c.id), x.blob, { contentType: MIDI });
          updateClip(x.key, x.c.id, (c) => Object.assign(c, { cloud: true }));
          done++;
        } catch (e) {
          console.error(e);
          recsStatus.failed = true;
        }
        recsStatus.pending--;
        emit("recs");
      }
      if (done) changed();
    } while (again);
  } catch (e) {
    console.error(e);
    recsStatus.failed = true;
    emit("recs");
  } finally {
    running = false;
  }
}

// ---------- downloads ----------
/**
 * The file of a recording: from this device, or downloaded (then kept here).
 * Resolves to a Blob, or null when it is on another device and not online yet.
 */
export async function clipBlob(c) {
  let blob = null;
  try {
    blob = await getClip(c.id);
  } catch {
    /* IndexedDB unavailable: try online */
  }
  if (blob || !c.cloud || c.mime !== MIDI) return blob;
  const user = await ready();
  if (!user) return null;
  blob = await st.getBlob(fileRef(user, c.id));
  if (blob.type !== MIDI) blob = new Blob([blob], { type: MIDI });
  putClip(c.id, blob).catch(() => {});
  return blob;
}

/** Whether the file can be had: on this device, or online with an account signed in. */
export async function clipWhere(c) {
  try {
    if (await getClip(c.id)) return "here";
  } catch {
    /* ignore */
  }
  if (c.cloud) return account.status === "in" ? "cloud" : "signin";
  return "elsewhere";
}

// ---------- deletion ----------
function pendingDeletes() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_DELETE));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function savePendingDeletes(list) {
  try {
    localStorage.setItem(LS_DELETE, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
async function flushDeletes(user) {
  const list = pendingDeletes();
  if (!list.length) return;
  const left = [];
  for (const id of list) {
    try {
      await st.deleteObject(fileRef(user, id));
    } catch (e) {
      if (e && e.code !== "storage/object-not-found") left.push(id);
    }
  }
  savePendingDeletes(left);
}

/** Remove a recording: from its session, this device and the bucket (now, or when next signed in). */
export function deleteRecording(key, c) {
  updateClip(key, c.id, () => null);
  deleteClip(c.id);
  if (c.cloud) {
    savePendingDeletes(pendingDeletes().concat(c.id));
    run();
  }
  changed();
}

export function initCloudRecs() {
  on("account", () => {
    if (account.status === "in") run();
  });
  on("changed", () => account.status === "in" && run());
  on("data", () => account.status === "in" && run());
}
