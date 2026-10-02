// Application state, persistence in localStorage, data migration and conflict-free merging.
//
// Data model (synced to the gist):
//   acts:    { id: {name, goal, t, created} | {deleted: true, t} }
//   entries: { "act/YYYY-MM-DD/sid": {min, note, start?, end?, pause?, bpm?, clips?, t} | {deleted: true, t} }
// Every record carries a timestamp `t`; when two devices disagree, the most recent record wins.
import { DATE_RE, readJSON, writeJSON, readStr, writeStr, keyOf, addDays, weekStart, uid } from "./util.js";
import { emit } from "./bus.js";

const LS_DATA = "suivi-piano-v4";
const LS_LEGACY = ["suivi-piano-v3", "suivi-piano-v1"];
const LS_CUR = "suivi-piano-current";
const LS_RUN = "suivi-piano-run";

export const state = {
  data: { acts: {}, entries: {} },
  cur: "", // current activity id
  run: null, // live session: {act, start, note, clips, pausedMs, pausedAt, bpm}
  view: "sess", // "sess" | "stats"
  page: 0, // calendar window offset, in 5-week pages
  selected: keyOf(new Date()),
  editing: null, // key of the session being edited
  adding: false,
  focusOpen: false,
};

// ---------- validation ----------
// Data from imports and the gist is untrusted: keep only known fields with the expected types.
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

// ---------- normalisation & migration ----------
export function normalize(obj) {
  const out = { acts: {}, entries: {} };
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
export const merge = (a, b) => ({ acts: mergeMap(a.acts, b.acts), entries: mergeMap(a.entries, b.entries) });

function sortObj(o) {
  const r = {};
  Object.keys(o)
    .sort()
    .forEach((k) => {
      r[k] = o[k];
    });
  return r;
}
export const canon = (d) => JSON.stringify({ acts: sortObj(d.acts), entries: sortObj(d.entries) });
export const payload = () =>
  JSON.stringify(
    { app: "suivi-piano", version: 4, acts: sortObj(state.data.acts), entries: sortObj(state.data.entries) },
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
