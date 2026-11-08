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

/**
 * White keys of the scrollable keyboard, as diatonic numbers: whole octaves covering the notes
 * of the current settings, and always at least C3 to B4 (the octaves around middle C).
 */
export function keyboardRange() {
  const clefs = read.prefs.clef === "tb" ? CLEFS : [read.prefs.clef];
  let lo = 21,
    hi = 34;
  for (const c of clefs) {
    const [a, b] = RANGES[read.prefs.level][c];
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return [lo - letterOf(lo), hi + 6 - letterOf(hi)];
}

export function notesOf(clef, level) {
  const [lo, hi] = RANGES[level][clef],
    out = [];
  for (let dn = lo; dn <= hi; dn++) out.push(dn);
  return out;
}

// ---------- persistence ----------
const okClef = (c) => c === "t" || c === "b" || c === "tb";
const DEFAULT_PREFS = { clef: "t", level: "five", len: 20, names: "", midi: false, kbd: "octave" };

function clean(raw) {
  const r = { prefs: Object.assign({}, DEFAULT_PREFS), stats: {}, history: [] };
  if (!raw || typeof raw !== "object") return r;
  const p = raw.prefs || {};
  if (okClef(p.clef)) r.prefs.clef = p.clef;
  if (LEVELS.includes(p.level)) r.prefs.level = p.level;
  if (LENGTHS.includes(p.len)) r.prefs.len = p.len;
  if (p.names === "solf" || p.names === "abc") r.prefs.names = p.names;
  r.prefs.midi = p.midi === true;
  if (p.kbd === "octave" || p.kbd === "scroll") r.prefs.kbd = p.kbd;
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

const AHEAD = 24; // notes generated ahead of the current one, so the staff runs off the edge even on a wide screen
const SWITCH = 0.4; // with both clefs, chance of a clef change once the current clef has had 2 notes

/** Clef for the next note: keeps at least 2 notes per clef, so changes stay readable. */
function nextClef(prev, run) {
  const c = read.prefs.clef;
  if (c !== "tb") return c;
  if (!prev) return CLEFS[Math.random() < 0.5 ? 0 : 1];
  if (run >= 2 && Math.random() < SWITCH) return prev.clef === "t" ? "b" : "t";
  return prev.clef;
}

function pick(prev, run) {
  const clef = nextClef(prev, run);
  const pool = [];
  for (const dn of notesOf(clef, read.prefs.level)) {
    if (prev && prev.clef === clef && prev.dn === dn) continue; // never the same note twice in a row
    pool.push({ dn, w: weight(clef, dn) });
  }
  let r = Math.random() * pool.reduce((a, p) => a + p.w, 0);
  for (const p of pool) if ((r -= p.w) <= 0) return { clef, dn: p.dn, res: null };
  return { clef, dn: pool[pool.length - 1].dn, res: null };
}

/** Top up the queue of upcoming notes, without going past the end of the round. */
function fill() {
  const left = round.total - round.i;
  while (round.queue.length < Math.min(AHEAD, left)) {
    const prev = round.queue[round.queue.length - 1] || round.last;
    const next = pick(prev, round.run);
    round.run = prev && next.clef === prev.clef ? round.run + 1 : 1;
    round.queue.push(next);
  }
}

export function startRound() {
  lastResult = null;
  round = { total: read.prefs.len, queue: [], last: null, run: 0, i: 0, ok: 0, times: [], misses: {}, cur: null, shownAt: 0, fb: null };
  fill();
  round.cur = round.queue[0];
  round.shownAt = performance.now();
}

/** Drop the answered note and move to the next one. */
export function nextNote() {
  round.last = round.queue.shift();
  fill();
  round.cur = round.queue[0];
  round.shownAt = performance.now();
  round.fb = null;
}

/**
 * Answer the current note with a letter (0–6), optionally with an exact MIDI pitch.
 * Returns the feedback: {ok, wrongOctave, letter}.
 */
export function answer(letter, midi, skipped) {
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
  round.cur.res = ok ? "ok" : "bad";
  round.fb = { ok, wrongOctave: rightLetter && !ok, letter, skipped: !!skipped };
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
