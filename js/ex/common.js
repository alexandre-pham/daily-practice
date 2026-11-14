// Small helpers shared by the exercise modules.
import { t } from "../i18n.js";
import { midiOf, intervalOf, pickOne, shuffle } from "../theory.js";
import { noteLabel } from "../exercises.js";

/** One staff with quarter (or whole) notes, for question exercises. */
export function line(clef, key, notes, opts = {}) {
  return {
    staves: [{ clef }],
    key,
    voices: [{ staff: 0, events: notes.map((n, i) => ({ d: opts.d || 1, notes: Array.isArray(n) ? n : [n], label: opts.labels ? opts.labels[i] : undefined })) }],
  };
}
export const clefPick = (p) => (p.clef === "tb" ? pickOne(["t", "b"]) : p.clef || "t");
/** Range (diatonic numbers) where notes read comfortably on each clef: ledger lines allowed. */
export const RANGE = { t: [28, 40], b: [16, 28] };
export const dirWord = (d) => (d > 0 ? "↑" : d < 0 ? "↓" : "");
export const dirKey = (d) => (d > 0 ? "up" : d < 0 ? "dn" : "eq");

/** Interval name: "tierce majeure ↑". */
export function ivName(a, b, withQuality = true) {
  const iv = intervalOf(a, b);
  return t("ivName", iv.number, withQuality ? iv.quality : "") + (iv.dir ? " " + dirWord(iv.dir) : "");
}
export const midis = (notes) => notes.map(midiOf);
export const names = (notes) => notes.map(noteLabel).join(" – ");

/** Colour every event of a score: ok, or bad for the indexes given. */
export function markEvents(api, ok, badIdx = []) {
  api.events.forEach((e, i) => e._el && e._el.classList.add(ok || !badIdx.includes(i) ? (ok ? "is-ok" : "is-hint") : "is-bad"));
}

/** Choices: the right label and distractors, shuffled. */
export function choicesOf(right, wrong, max = 4) {
  const set = [...new Set(wrong.filter((w) => w !== right))];
  return shuffle([{ label: right, ok: true }, ...shuffle(set).slice(0, max - 1).map((label) => ({ label, ok: false }))]);
}

/** A MIDI pitch as a spelled note (sharps for black keys). */
export function spellMidi(m) {
  const pc = ((m % 12) + 12) % 12,
    oct = Math.floor(m / 12) - 1;
  const white = [0, 2, 4, 5, 7, 9, 11].indexOf(pc);
  if (white >= 0) return { dn: oct * 7 + white, acc: 0 };
  return { dn: oct * 7 + [0, 2, 4, 5, 7, 9, 11].indexOf(pc - 1), acc: 1 };
}
/** Grand staff with notes in time order, each on the staff that suits its pitch. */
export function grandSeq(notes, key = 0, d = 4) {
  const top = [],
    bot = [];
  for (const n of notes) {
    const hi = n.dn >= 28;
    top.push(hi ? { d, notes: [n] } : { d, notes: [], hidden: true });
    bot.push(hi ? { d, notes: [], hidden: true } : { d, notes: [n] });
  }
  return {
    staves: [{ clef: "t" }, { clef: "b" }],
    key,
    voices: [
      { staff: 0, events: top },
      { staff: 1, events: bot },
    ],
  };
}
