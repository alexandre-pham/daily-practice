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
