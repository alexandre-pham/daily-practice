// Reading exercises beyond the single-note drill: shared statistics, rounds, settings and levels.
//
// Each exercise is a module (js/ex/*.js) describing its levels and how to build a question or a
// piece; the screens in js/ui/exrun.js and js/ui/perform.js run them. Per-item statistics live
// in the synced data (state.data.read.skills, one record per item such as "int:t:3M:up"),
// with the same moving averages as the note drill, so missed or slow items come back more often.
// Finished rounds go to state.data.read.rounds with an `ex` field. Settings stay on the device.
import { readJSON, writeJSON, uid } from "./util.js";
import { state, saveLocal, changed, SKILL_RE } from "./store.js";
import { t, lang } from "./i18n.js";
import { read } from "./reading.js";
import { nameOf, letterOf } from "./theory.js";

const LS_EX = "suivi-exercises-v1";

// ---------- local settings ----------
const local = Object.assign({ prefs: {}, tempo: {}, latency: 0, lessons: {}, daily: { len: 15, act: "" } }, readJSON(LS_EX, {}));
if (!local.prefs || typeof local.prefs !== "object") local.prefs = {};
if (!local.tempo || typeof local.tempo !== "object") local.tempo = {};
if (!local.lessons || typeof local.lessons !== "object") local.lessons = {};
if (!local.daily || typeof local.daily !== "object") local.daily = { len: 15, act: "" };
const save = () => writeJSON(LS_EX, local);

/** Settings of one exercise, with its defaults filled in. */
export function exPrefs(ex) {
  const p = Object.assign({ level: 1, len: ex.lengths ? ex.lengths[0] : 10 }, ex.defaults || {}, local.prefs[ex.id] || {});
  if (!(p.level >= 1 && p.level <= ex.levels.length)) p.level = 1;
  return p;
}
export function setExPref(ex, key, value) {
  local.prefs[ex.id] = Object.assign({}, local.prefs[ex.id] || {}, { [key]: value });
  save();
}
export const latency = () => (Number.isFinite(local.latency) ? local.latency : 0);
export function setLatency(ms) {
  local.latency = Math.max(-200, Math.min(400, Math.round(ms)));
  save();
}
/** Tempo remembered per rhythm level (and per other timed exercise). */
export const tempoOf = (key, def = 60) => (local.tempo[key] >= 30 && local.tempo[key] <= 240 ? local.tempo[key] : def);
export function setTempo(key, bpm) {
  local.tempo[key] = Math.max(30, Math.min(240, Math.round(bpm)));
  save();
}
export const lessonRead = (id) => !!local.lessons[id];
export function markLesson(id) {
  local.lessons[id] = 1;
  save();
}
export const dailyPrefs = () => local.daily;
export function setDaily(key, value) {
  local.daily[key] = value;
  save();
}

// ---------- names ----------
export const namesMode = () => read.prefs.names || (lang === "fr" ? "solf" : "abc");
export const NAMES = () => t(namesMode() === "solf" ? "notesSolf" : "notesAbc");
/** "Fa♯" for a spelled note or {letter, acc}. */
export const noteLabel = (n) => nameOf(NAMES(), n.letter !== undefined ? n.letter : letterOf(n.dn), n.acc || 0);
/** Name with the octave number for exact pitches: "Do4". */
export const pitchLabel = (n) => noteLabel(n) + Math.floor(n.dn / 7);
/** Plain ASCII name for statistic keys: "F#", "Bb". */
export const asciiName = (n) => "CDEFGAB"[n.letter !== undefined ? n.letter : letterOf(n.dn)] + ["bb", "b", "", "#", "##"][(n.acc || 0) + 2];

// ---------- skill statistics ----------
const skills = () => state.data.read.skills;
export const skill = (key) => skills()[key];

/** Record an answer: moving averages, so recent answers count more than old ones. */
export function recordSkill(key, ok, ms) {
  if (!SKILL_RE.test(key)) return;
  const map = skills(),
    s = map[key],
    now = Date.now();
  ms = Math.max(0, Math.min(6e5, Math.round(ms || 0)));
  if (!s) map[key] = { n: 1, acc: ok ? 1 : 0, ms: ok ? ms : 0, t: now };
  else
    map[key] = {
      n: s.n + 1,
      acc: s.acc * 0.75 + (ok ? 0.25 : 0),
      ms: ok ? (s.ms ? s.ms * 0.7 + ms * 0.3 : ms) : s.ms,
      t: now,
    };
  saveLocal(); // synced once, when the round ends
}

/** Weight for picking: unseen items and missed or slow ones come back more often. */
export function skillWeight(key, thr = 2500) {
  const s = skills()[key];
  if (!s) return 3;
  const slow = s.ms ? Math.min(2, Math.max(0, (s.ms - thr * 0.6) / (thr * 0.4))) : 1;
  return 1 + 4 * (1 - s.acc) + slow;
}
/** 0 unseen, 1 needs work, 2 getting there, 3 solid. */
export function skillMastery(key, thr = 2500) {
  const s = skills()[key];
  if (!s) return 0;
  if (s.n >= 3 && s.acc >= 0.9 && (!thr || (s.ms && s.ms <= thr))) return 3;
  return s.acc >= 0.7 ? 2 : 1;
}
/** Share of an exercise's recorded items that are solid, and how many items were seen. */
export function exMastery(ex) {
  const pre = ex.prefix + ":",
    keys = Object.keys(skills()).filter((k) => k.startsWith(pre));
  if (!keys.length) return { seen: 0, solid: 0, mid: 0 };
  let solid = 0,
    mid = 0;
  for (const k of keys) {
    const m = skillMastery(k, ex.thr);
    if (m === 3) solid++;
    else if (m === 2) mid++;
  }
  return { seen: keys.length, solid: solid / keys.length, mid: mid / keys.length };
}

/** Pick one candidate, weighted by its item's statistics. Candidates: [{item, ...}]. */
export function pickByWeight(cands, thr) {
  const w = cands.map((c) => skillWeight(c.item, thr));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) if ((r -= w[i]) <= 0) return cands[i];
  return cands[cands.length - 1];
}

// ---------- rounds ----------
export function addRound(rec) {
  state.data.read.rounds["r" + uid()] = Object.assign({}, rec, { t: Date.now() });
  changed();
}
/** Finished rounds of an exercise, newest first. */
export function exRounds(id) {
  const r = state.data.read.rounds;
  return Object.keys(r)
    .map((k) => r[k])
    .filter((h) => h.ex === id)
    .sort((a, b) => b.t - a.t);
}

/**
 * The level path: a level is passed when its last 3 rounds each reach 90 % (and, for timed
 * answers, the median answer time is under the exercise's threshold).
 */
export function levelPassed(ex, level) {
  const last = exRounds(ex.id)
    .filter((h) => h.level === level)
    .slice(0, 3);
  if (last.length < 3) return false;
  return last.every((h) => h.ok / h.n >= 0.9 && (!ex.thr || !h.ms || h.ms <= ex.thr) && (h.cont === undefined || h.cont >= 0.9));
}
/** The highest level reached and passed, and the level to work on next. */
export function pathOf(ex) {
  let passed = 0;
  for (let l = 1; l <= ex.levels.length; l++) if (levelPassed(ex, l)) passed = l;
  return { passed, next: Math.min(ex.levels.length, passed + 1) };
}

// ---------- registry ----------
export const EXERCISES = [];
export function register(...list) {
  for (const ex of list) if (!EXERCISES.includes(ex)) EXERCISES.push(ex);
}
export const exById = (id) => EXERCISES.find((e) => e.id === id);
