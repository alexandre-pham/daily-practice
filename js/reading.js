// Note-reading drill: which notes to ask, how well each one is known, and the round in progress.
//
// Notes are diatonic numbers: octave * 7 + letter (C = 0 … B = 6), so middle C (C4) is 28.
// Per-note stats are kept per clef, because reading E4 in the treble clef and in the bass clef
// are different skills. Stored on this device only (not synced to the gist).
import { readJSON, writeJSON } from "./util.js";

const LS_READ = "suivi-reading-v1";
const HISTORY_MAX = 30;

export const CLEFS = ["t", "b"]; // treble, bass
/** Diatonic number of each clef's bottom staff line: E4 (treble), G2 (bass). */
export const BOTTOM = { t: 30, b: 18 };

/** Note ranges per level, inclusive, as [low, high] diatonic numbers. */
export const RANGES = {
  // Grade 1 hand positions: right thumb on middle C, left little finger on the C below.
  five: { t: [28, 32], b: [21, 25] },
  // Every line and space, plus the note just outside the staff on each side.
  staff: { t: [29, 39], b: [17, 27] },
  // Up to two ledger lines above and below.
  ledger: { t: [26, 42], b: [14, 30] },
};
export const LEVELS = Object.keys(RANGES);
export const LENGTHS = [10, 20, 40];

const SEMI = [0, 2, 4, 5, 7, 9, 11];
export const letterOf = (dn) => ((dn % 7) + 7) % 7;
export const midiOf = (dn) => 12 * (Math.floor(dn / 7) + 1) + SEMI[letterOf(dn)];
export const noteKey = (clef, dn) => clef + dn;

export function notesOf(clef, level) {
  const [lo, hi] = RANGES[level][clef],
    out = [];
  for (let dn = lo; dn <= hi; dn++) out.push(dn);
  return out;
}

// ---------- persistence ----------
const okClef = (c) => c === "t" || c === "b" || c === "tb";
const DEFAULT_PREFS = { clef: "t", level: "five", len: 20, names: "", midi: false };

function clean(raw) {
  const r = { prefs: Object.assign({}, DEFAULT_PREFS), stats: {}, history: [] };
  if (!raw || typeof raw !== "object") return r;
  const p = raw.prefs || {};
  if (okClef(p.clef)) r.prefs.clef = p.clef;
  if (LEVELS.includes(p.level)) r.prefs.level = p.level;
  if (LENGTHS.includes(p.len)) r.prefs.len = p.len;
  if (p.names === "solf" || p.names === "abc") r.prefs.names = p.names;
  r.prefs.midi = p.midi === true;
  const s = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k in s) {
    const v = s[k];
    if (!/^[tb]\d{1,2}$/.test(k) || !v || typeof v !== "object") continue;
    const n = Number(v.n),
      acc = Number(v.acc),
      ms = Number(v.ms);
    if (!(n >= 1) || !(acc >= 0 && acc <= 1)) continue;
    r.stats[k] = { n: Math.round(n), acc, ms: ms > 0 && ms < 600000 ? ms : 0 };
  }
  if (Array.isArray(raw.history))
    r.history = raw.history
      .filter((h) => h && typeof h.t === "number" && h.n >= 1 && h.ok >= 0 && h.ok <= h.n && okClef(h.clef))
      .slice(0, HISTORY_MAX);
  return r;
}

export const read = clean(readJSON(LS_READ, null));
const save = () => writeJSON(LS_READ, read);

export function setPref(key, value) {
  read.prefs[key] = value;
  save();
}

// ---------- mastery ----------
/** 0 unseen, 1 needs work, 2 getting there, 3 solid. */
export function mastery(clef, dn) {
  const s = read.stats[noteKey(clef, dn)];
  if (!s) return 0;
  if (s.n >= 3 && s.acc >= 0.9 && s.ms && s.ms <= 2500) return 3;
  return s.acc >= 0.7 ? 2 : 1;
}

function weight(clef, dn) {
  const s = read.stats[noteKey(clef, dn)];
  if (!s) return 3;
  const slow = s.ms ? Math.min(2, Math.max(0, (s.ms - 1500) / 1000)) : 1;
  return 1 + 4 * (1 - s.acc) + slow;
}

function record(clef, dn, ok, ms) {
  const k = noteKey(clef, dn),
    s = read.stats[k];
  // Moving averages, so recent answers count more than old ones.
  if (!s) read.stats[k] = { n: 1, acc: ok ? 1 : 0, ms: ok ? ms : 0 };
  else {
    s.n++;
    s.acc = s.acc * 0.75 + (ok ? 0.25 : 0);
    if (ok) s.ms = s.ms ? s.ms * 0.7 + ms * 0.3 : ms;
  }
  save();
}

// ---------- round ----------
/** The round in progress (memory only), or null. */
export let round = null;
/** The last finished round's summary, shown until the next one starts. */
export let lastResult = null;

function pick(prev) {
  const clefs = read.prefs.clef === "tb" ? CLEFS : [read.prefs.clef];
  const pool = [];
  for (const clef of clefs)
    for (const dn of notesOf(clef, read.prefs.level)) {
      if (prev && prev.clef === clef && prev.dn === dn) continue; // never the same note twice in a row
      pool.push({ clef, dn, w: weight(clef, dn) });
    }
  let r = Math.random() * pool.reduce((a, p) => a + p.w, 0);
  for (const p of pool) if ((r -= p.w) <= 0) return { clef: p.clef, dn: p.dn };
  return pool[pool.length - 1];
}

export function startRound() {
  lastResult = null;
  round = { total: read.prefs.len, i: 0, ok: 0, times: [], misses: {}, cur: null, shownAt: 0, fb: null };
  nextNote();
}

export function nextNote() {
  round.cur = pick(round.cur);
  round.shownAt = performance.now();
  round.fb = null;
}

/**
 * Answer the current note with a letter (0–6), optionally with an exact MIDI pitch.
 * Returns the feedback: {ok, wrongOctave, letter}.
 */
export function answer(letter, midi) {
  const { clef, dn } = round.cur,
    ms = performance.now() - round.shownAt,
    rightLetter = letter === letterOf(dn),
    ok = rightLetter && (midi === undefined || midi === midiOf(dn));
  record(clef, dn, ok, ms);
  round.i++;
  if (ok) {
    round.ok++;
    round.times.push(ms);
  } else {
    const k = noteKey(clef, dn);
    round.misses[k] = (round.misses[k] || 0) + 1;
  }
  round.fb = { ok, wrongOctave: rightLetter && !ok, letter };
  return round.fb;
}

export const roundOver = () => round && round.i >= round.total;

/** Close the round; a finished round is added to the history. */
export function endRound() {
  if (!round) return;
  if (round.i >= round.total) {
    const times = round.times,
      ms = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    lastResult = {
      t: Date.now(),
      clef: read.prefs.clef,
      level: read.prefs.level,
      n: round.total,
      ok: round.ok,
      ms: Math.round(ms),
      misses: Object.entries(round.misses)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => ({ clef: k[0], dn: Number(k.slice(1)) })),
    };
    read.history.unshift({ t: lastResult.t, clef: lastResult.clef, level: lastResult.level, n: lastResult.n, ok: lastResult.ok, ms: lastResult.ms });
    read.history.length = Math.min(read.history.length, HISTORY_MAX);
    save();
  }
  round = null;
}

export function dismissResult() {
  lastResult = null;
}
