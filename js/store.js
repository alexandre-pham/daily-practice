// Application state, persistence in localStorage, data migration and conflict-free merging.
//
// Data model (synced with Firestore, see cloud-sync.js):
//   acts:    { id: {name, goal, t, created} | {deleted: true, t} }
//   entries: { "act/YYYY-MM-DD/sid": {min, note, start?, end?, pause?, bpm?, clips?, t} | {deleted: true, t} }
//            clips: [{id, at, dur, mime, notes, name?, cloud?}]  recordings made during the session;
//            the files themselves are in IndexedDB (and in Cloud Storage once `cloud` is set)
//   read:    { notes:  { "t30": {n, acc, ms, t} }            note-reading stats, one record per clef and note
//              skills: { "int:t:3M:up": {n, acc, ms, t} }   reading-exercise stats, one record per item
//              rounds: { rid: {clef, level, n, ok, ms, t} }   finished note-reading rounds
//                    | { rid: {ex, level, n, ok, ms, t, tempo?, cont?, score?} } }  other exercises
// Every record carries a timestamp `t`; when two devices disagree, the most recent record wins.
import { DATE_RE, readJSON, writeJSON, readStr, writeStr, keyOf, dateOf, addDays, weekStart, uid } from "./util.js";
import { emit } from "./bus.js";

const LS_DATA = "suivi-piano-v4";
const LS_LEGACY = ["suivi-piano-v3", "suivi-piano-v1"];
const LS_CUR = "suivi-piano-current";
const LS_RUN = "suivi-piano-run";

export const state = {
  data: { acts: {}, entries: {}, read: { notes: {}, skills: {}, rounds: {} } },
  cur: "", // current activity id
  run: null, // live session: {act, start, note, clips, pausedMs, pausedAt, bpm}
  view: "sess", // "sess" | "stats" | "read"
  page: 0, // calendar window offset, in 5-week pages
  selected: keyOf(new Date()),
  adding: false,
  focusOpen: false,
};

// ---------- validation ----------
// Data from imports and from Firestore is untrusted: keep only known fields with the expected types.
const ID_RE = /^[\w-]{1,64}$/;
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isId = (s) => typeof s === "string" && ID_RE.test(s) && !BAD_KEYS.has(s);
const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
const T_MAX = 8.64e15; // largest valid Date

/** Copy defined values only, so JSON output stays unchanged for well-formed records. */
function pick(o) {
  const r = {};
  for (const k in o) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

function cleanAct(v) {
  if (!v || typeof v !== "object") return null;
  const t = num(v.t, 0, T_MAX) || 0;
  if (v.deleted) return { deleted: true, t };
  const name = str(v.name, 40);
  if (!name) return null;
  return pick({ name, goal: Math.round(num(v.goal, 5, 3000) || 210), t, created: num(v.created, 0, T_MAX) });
}

function cleanClip(c) {
  if (!c || typeof c !== "object" || !isId(c.id)) return null;
  return pick({
    id: c.id,
    at: num(c.at, 0, T_MAX),
    dur: num(c.dur, 0, 1e6),
    mime: str(c.mime, 100),
    notes: num(c.notes, 0, 1e7),
    name: str(c.name, 80) || undefined,
    cloud: c.cloud === true || undefined,
  });
}

function cleanEntry(v) {
  if (!v || typeof v !== "object") return null;
  const t = num(v.t, 0, T_MAX) || 0;
  if (v.deleted) return { deleted: true, t };
  const min = num(v.min, 0, 1440);
  if (min === undefined) return null;
  const clips = Array.isArray(v.clips) ? v.clips.map(cleanClip).filter(Boolean) : [];
  return pick({
    min,
    note: str(v.note, 500),
    start: num(v.start, 0, T_MAX),
    end: num(v.end, 0, T_MAX),
    pause: num(v.pause, 0, 1e5),
    bpm: num(v.bpm, 1, 1000),
    clips: clips.length ? clips : undefined,
    t,
  });
}

const NOTE_RE = /^[tb]\d{1,2}$/;
export const SKILL_RE = /^[a-z0-9_]{2,8}:[\w#:+.-]{1,48}$/;
/** Exercises whose rounds are kept (see js/exercises.js). */
export const EX_IDS = ["intervals", "keys", "rhythm", "chords", "degrees", "cadences", "pieces", "ensemble", "jumps", "ear", "notesq", "bench", "daily"];
const ROUNDS_MAX = 600;
const okIn = (v, list) => (list.includes(v) ? v : undefined);

function cleanNote(v) {
  if (!v || typeof v !== "object") return null;
  const n = num(v.n, 1, 1e7),
    acc = num(v.acc, 0, 1);
  if (n === undefined || acc === undefined) return null;
  return { n: Math.round(n), acc, ms: num(v.ms, 0, 6e5) || 0, t: num(v.t, 0, T_MAX) || 0 };
}
function cleanRound(v) {
  if (!v || typeof v !== "object") return null;
  if (v.ex !== undefined) {
    const ex = okIn(v.ex, EX_IDS),
      n = num(v.n, 1, 1000),
      ok = num(v.ok, 0, 1000),
      level = num(v.level, 1, 20),
      t = num(v.t, 0, T_MAX);
    if (!ex || n === undefined || ok === undefined || ok > n || level === undefined || !t) return null;
    return pick({
      ex,
      level: Math.round(level),
      n: Math.round(n),
      ok: Math.round(ok),
      ms: num(v.ms, 0, 36e5) || 0,
      tempo: num(v.tempo, 20, 300),
      cont: num(v.cont, 0, 1),
      score: num(v.score, 0, 20),
      t,
    });
  }
  const n = num(v.n, 1, 1000),
    ok = num(v.ok, 0, 1000),
    clef = okIn(v.clef, ["t", "b", "tb"]),
    level = okIn(v.level, ["five", "staff", "ledger"]),
    t = num(v.t, 0, T_MAX);
  if (n === undefined || ok === undefined || ok > n || !clef || !level || !t) return null;
  return { clef, level, n, ok, ms: num(v.ms, 0, 6e5) || 0, t };
}

/** Keep only the most recent rounds, so the synced file stays small. */
function trimRounds(rounds) {
  const keys = Object.keys(rounds);
  if (keys.length <= ROUNDS_MAX) return rounds;
  const out = {};
  keys
    .sort((a, b) => rounds[b].t - rounds[a].t || a.localeCompare(b))
    .slice(0, ROUNDS_MAX)
    .forEach((k) => (out[k] = rounds[k]));
  return out;
}

function normalizeRead(obj) {
  const out = { notes: {}, skills: {}, rounds: {} };
  if (!obj || typeof obj !== "object") return out;
  const notes = obj.notes && typeof obj.notes === "object" ? obj.notes : {},
    skills = obj.skills && typeof obj.skills === "object" ? obj.skills : {},
    rounds = obj.rounds && typeof obj.rounds === "object" ? obj.rounds : {};
  for (const k of Object.keys(notes)) {
    const v = NOTE_RE.test(k) && cleanNote(notes[k]);
    if (v) out.notes[k] = v;
  }
  for (const k of Object.keys(skills)) {
    const v = SKILL_RE.test(k) && !BAD_KEYS.has(k) && cleanNote(skills[k]);
    if (v) out.skills[k] = v;
  }
  for (const k of Object.keys(rounds)) {
    const v = isId(k) && cleanRound(rounds[k]);
    if (v) out.rounds[k] = v;
  }
  out.rounds = trimRounds(out.rounds);
  return out;
}

// ---------- normalisation & migration ----------
export function normalize(obj) {
  const out = { acts: {}, entries: {}, read: normalizeRead(obj && obj.read) };
  if (!obj || typeof obj !== "object") return out;
  if (obj.acts && obj.entries && typeof obj.acts === "object" && typeof obj.entries === "object") {
    for (const id of Object.keys(obj.acts)) {
      const a = isId(id) && cleanAct(obj.acts[id]);
      if (a) out.acts[id] = a;
    }
    for (const k of Object.keys(obj.entries)) {
      const v = cleanEntry(obj.entries[k]);
      if (!v) continue;
      const p = k.split("/");
      if (p.length === 3 && isId(p[0]) && DATE_RE.test(p[1]) && isId(p[2])) out.entries[k] = v;
      else if (p.length === 2 && isId(p[0]) && DATE_RE.test(p[1])) out.entries[k + "/jour"] = v; // v3: one session per day
    }
    return out;
  }
  const old = obj.entries && typeof obj.entries === "object" ? obj.entries : obj; // v1/v2: piano only
  let any = false;
  for (const k of Object.keys(old)) {
    const v = DATE_RE.test(k) && cleanEntry(Object.assign({ t: 0 }, old[k]));
    if (v) {
      out.entries["piano/" + k + "/jour"] = v;
      any = true;
    }
  }
  if (any) out.acts.piano = { name: "Piano", goal: 210, t: 0, created: 0 };
  return out;
}

function mergeMap(a, b) {
  const out = Object.assign({}, a);
  for (const k in b) if (b[k] && (!out[k] || (b[k].t || 0) > (out[k].t || 0))) out[k] = b[k];
  return out;
}
export const merge = (a, b) => ({
  acts: mergeMap(a.acts, b.acts),
  entries: mergeMap(a.entries, b.entries),
  read: {
    notes: mergeMap(a.read.notes, b.read.notes),
    skills: mergeMap(a.read.skills, b.read.skills),
    rounds: trimRounds(mergeMap(a.read.rounds, b.read.rounds)),
  },
});

function sortObj(o) {
  const r = {};
  Object.keys(o)
    .sort()
    .forEach((k) => {
      r[k] = o[k];
    });
  return r;
}
const sortRead = (r) => ({ notes: sortObj(r.notes), skills: sortObj(r.skills), rounds: sortObj(r.rounds) });
export const canon = (d) => JSON.stringify({ acts: sortObj(d.acts), entries: sortObj(d.entries), read: sortRead(d.read) });
export const payload = () =>
  JSON.stringify(
    {
      app: "suivi-piano",
      version: 4,
      acts: sortObj(state.data.acts),
      entries: sortObj(state.data.entries),
      read: sortRead(state.data.read),
    },
    null,
    1,
  );

// ---------- persistence ----------
export function load() {
  let raw = readJSON(LS_DATA, null);
  for (const k of LS_LEGACY) if (!raw) raw = readJSON(k, null);
  state.data = normalize(raw);
  state.run = readJSON(LS_RUN, null);
  if (state.run && !(state.run.start && state.run.act)) state.run = null;
  ensureActivity();
  if (state.run && !state.data.acts[state.run.act]) state.run = null;
  if (state.run) state.focusOpen = true;
  saveLocal();
}
export const saveLocal = () => writeJSON(LS_DATA, state.data);
export const saveRun = () => writeJSON(LS_RUN, state.run);
export const saveCur = () => writeStr(LS_CUR, state.cur);

/** Persist and notify (the sync module pushes, the UI re-renders). */
export function changed() {
  saveLocal();
  emit("changed");
}

/** Replace the data set (after a sync or an import) and notify. */
export function setData(next) {
  state.data = next;
  ensureActivity();
  saveLocal();
}

// ---------- activities ----------
export function liveActs() {
  const a = state.data.acts;
  return Object.keys(a)
    .filter((id) => !a[id].deleted)
    .sort((x, y) => (a[x].created || 0) - (a[y].created || 0) || x.localeCompare(y));
}
export const act = () => state.data.acts[state.cur];
export const goal = () => (act() && act().goal) || 210;
export const daily = () => Math.max(1, Math.round(goal() / 7));

export function ensureActivity() {
  if (!liveActs().length) state.data.acts.piano = { name: "Piano", goal: 210, t: 0, created: 0 };
  const list = liveActs(),
    saved = readStr(LS_CUR);
  state.cur = list.includes(state.cur) ? state.cur : list.includes(saved) ? saved : list[0];
}

export function newActId(name) {
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "activite";
  return slug + "-" + Math.random().toString(36).slice(2, 6);
}
export const sessionKey = (actId, day) => actId + "/" + day + "/" + uid();

/**
 * Edit a session's date, minutes and note. A new date means a new key: the old key gets a
 * tombstone so the move syncs, and recorded start/end times shift by the same number of days.
 * @returns {string|null} the session's key after the edit
 */
export function updateSession(key, { day, min, note }) {
  const e = state.data.entries[key];
  if (!e || e.deleted) return null;
  const [actId, oldDay] = key.split("/"),
    now = Date.now(),
    next = Object.assign({}, e, { min, note, t: now });
  if (day === oldDay) {
    state.data.entries[key] = next;
    return key;
  }
  const offset = Math.round((dateOf(day) - dateOf(oldDay)) / 864e5);
  for (const f of ["start", "end"]) if (next[f]) next[f] = addDays(new Date(next[f]), offset).getTime();
  const nk = sessionKey(actId, day);
  state.data.entries[nk] = next;
  state.data.entries[key] = { deleted: true, t: now };
  return nk;
}

// ---------- queries ----------
/** Live sessions, optionally for one activity: [{key, act, day, ...entry}] */
export function sessions(actId) {
  const out = [],
    acts = state.data.acts;
  for (const k in state.data.entries) {
    const e = state.data.entries[k];
    if (!e || e.deleted) continue;
    const [a, day, sid] = k.split("/");
    if (!sid || (actId && a !== actId) || !acts[a] || acts[a].deleted) continue;
    out.push(Object.assign({ key: k, act: a, day }, e));
  }
  return out;
}
export const daySessions = (day, actId = state.cur) =>
  sessions(actId)
    .filter((s) => s.day === day)
    .sort((x, y) => (x.start || x.t || 0) - (y.start || y.t || 0));
export function dayTotals(actId) {
  const m = {};
  sessions(actId).forEach((s) => {
    m[s.day] = (m[s.day] || 0) + (s.min || 0);
  });
  return m;
}

// ---------- statistics ----------
export function streakFrom(tot) {
  let d = new Date();
  if (!tot[keyOf(d)]) d = addDays(d, -1);
  let n = 0;
  while (tot[keyOf(d)]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
export function bestStreak(tot) {
  const days = Object.keys(tot)
    .filter((k) => tot[k] > 0)
    .sort();
  let best = 0,
    run = 0,
    prev = null;
  days.forEach((k) => {
    run = prev && keyOf(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    const [y, m, d] = k.split("-").map(Number);
    prev = new Date(y, m - 1, d);
  });
  return best;
}
export function sumRange(tot, start, n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += tot[keyOf(addDays(start, i))] || 0;
  return s;
}
export function weekMinutes(tot) {
  const now = new Date();
  return sumRange(tot, weekStart(now), ((now.getDay() + 6) % 7) + 1);
}

// ---------- recordings ----------
/** Recordings of the live sessions of an activity, newest first: [{clip, key, day}] */
export function recordings(actId = state.cur) {
  const out = [];
  sessions(actId).forEach((s) => (s.clips || []).forEach((c) => out.push({ clip: c, key: s.key, day: s.day })));
  return out.sort((a, b) => (b.clip.at || 0) - (a.clip.at || 0));
}

/** Change one recording inside its session; the session's timestamp moves so the change syncs. */
export function updateClip(key, id, fn) {
  const e = state.data.entries[key];
  if (!e || e.deleted || !e.clips) return false;
  const i = e.clips.findIndex((c) => c.id === id);
  if (i < 0) return false;
  const clips = e.clips.slice(),
    next = fn(Object.assign({}, clips[i]));
  if (next) clips[i] = next;
  else clips.splice(i, 1);
  const entry = Object.assign({}, e, { t: Date.now() });
  if (clips.length) entry.clips = clips;
  else delete entry.clips;
  state.data.entries[key] = entry;
  return true;
}
