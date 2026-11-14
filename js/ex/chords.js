// Chords: recognise a triad (or seventh chord) as one block and play it.
import { t } from "../i18n.js";
import { chordOf, chordOnDegree, degreeRoot, invert, placeFrom, midiOf, pcSet, sameSet, chordSymbol, qualityOf, pickOne, rnd } from "../theory.js";
import { pickByWeight, NAMES, asciiName } from "../exercises.js";
import { clefPick, choicesOf, names } from "./common.js";

const LEVELS = [{ white: true }, { key: true }, { key: true, inv: true }, { key: true, spread: true }, { key: true, inv: true, exact: true }, { key: true, inv: true, seventh: true }];
const KEYS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const LOW = { t: [28], b: [16] };
const SUF = { maj: "", min: "m", dim: "dim", aug: "aug", dom7: "7" };

/** A chord as a candidate question: notes spelled in a key, an inversion, where it sits. */
function candidate(L, clef) {
  let key = 0,
    notes,
    quality;
  if (L.white) {
    const root = { dn: 28 + rnd(6), acc: 0 };
    quality = pickOne(["maj", "min"]);
    notes = chordOf(root, quality);
  } else {
    key = pickOne(KEYS);
    const seventh = L.seventh && Math.random() < 0.4;
    const deg = seventh ? 5 : 1 + rnd(6);
    notes = chordOnDegree(key, deg, degreeRoot(key, deg, 28), seventh);
    quality = qualityOf(notes);
  }
  const root = notes[0];
  const inv = L.inv ? rnd(notes.length === 4 ? 2 : 3) : 0;
  let voiced;
  if (L.spread) {
    // Low root and fifth in the left hand, third and root higher in the right (like a broken-chord accompaniment).
    const r = placeFrom([root], 16)[0];
    voiced = { lh: [r, { dn: r.dn + 4, acc: notes[2].acc }], rh: [{ dn: r.dn + 9, acc: notes[1].acc }, { dn: r.dn + 14, acc: root.acc }] };
    if (voiced.rh[1].dn > 42) voiced.rh = voiced.rh.map((n) => ({ dn: n.dn - 7, acc: n.acc }));
  } else {
    // lowest note between C4 and B4 (treble) or E2 and D3 (bass)
    voiced = placeFrom(invert(notes, inv), LOW[clef][0]);
  }
  const sym = asciiName(root) + SUF[quality];
  const item = "chord:" + (L.spread ? "g" : clef) + ":" + sym + ":" + inv;
  return { item, key, notes, quality, inv, voiced, clef, root };
}

function question(level, p, prev) {
  const L = LEVELS[level - 1];
  const cands = [];
  for (let i = 0; i < 12; i++) {
    const c = candidate(L, clefPick(p));
    if (!prev || c.item !== prev.item) cands.push(c);
  }
  const c = pickByWeight(cands, 3500);
  const N = NAMES();
  const bass = L.spread ? c.voiced.lh[0] : c.voiced[0];
  const sym = chordSymbol(N, c.root, c.quality),
    symFull = chordSymbol(N, c.root, c.quality, bass);
  const sc = L.spread
    ? {
        staves: [{ clef: "t" }, { clef: "b" }],
        key: c.key,
        voices: [
          { staff: 0, events: [{ d: 4, notes: c.voiced.rh }] },
          { staff: 1, events: [{ d: 4, notes: c.voiced.lh }] },
        ],
      }
    : { staves: [{ clef: c.clef }], key: c.key, voices: [{ staff: 0, events: [{ d: 4, notes: c.voiced }] }] };
  const want = pcSet(c.notes),
    exact = (L.spread ? [...c.voiced.lh, ...c.voiced.rh] : c.voiced).map(midiOf).sort((a, b) => a - b);
  // Distractors: the other quality on the same root, and chords on neighbouring roots.
  const wrong = [];
  for (const q of ["maj", "min", "dim", "dom7"]) if (q !== c.quality) wrong.push(chordSymbol(N, c.root, q));
  for (const d of [-1, 1, 2, -2]) {
    const r = { dn: c.root.dn + d, acc: 0 };
    wrong.push(chordSymbol(N, r, pickOne(["maj", "min"])));
  }
  return {
    item: c.item,
    sc,
    maxW: 300,
    label: names(c.notes),
    prompt: t("chords_prompt"),
    promptChoices: t("chords_ask"),
    expect: { kind: "chord" },
    judge: (got) => {
      if (L.exact) return { ok: sameSet(got, exact), exactMiss: sameSet(pcSet(got), want) };
      return { ok: sameSet(pcSet(got), want) };
    },
    choices: choicesOf(sym, wrong),
    fb: (ok, d) => {
      const what = symFull + " — " + names(c.notes);
      if (ok) return what;
      if (d && d.exactMiss) return t("chords_voicing") + " " + what;
      return t("fbWas", what);
    },
    mark: (apis, ok) => apis[0].events.forEach((e) => e._el && e._el.classList.add(ok ? "is-ok" : "is-hint")),
  };
}

function itemLabel(key) {
  const [, clef, sym, inv] = key.split(":");
  const N = NAMES(),
    m = sym.match(/^([A-G])(##|#|bb|b)?(.*)$/);
  if (!m) return sym;
  const acc = { "": 0, "#": 1, "##": 2, b: -1, bb: -2 }[m[2] || ""];
  const q = { "": "maj", m: "min", dim: "dim", aug: "aug", 7: "dom7" }[m[3]] || "maj";
  const name = chordSymbol(N, { dn: "CDEFGAB".indexOf(m[1]), acc }, q);
  const where = clef === "g" ? t("grandStaff") : t(clef === "t" ? "clefNameT" : "clefNameB");
  return name + (inv !== "0" ? " (" + t("invN", Number(inv)) + ")" : "") + " · " + where;
}

export default {
  id: "chords",
  prefix: "chord",
  kind: "quiz",
  levels: LEVELS,
  thr: 3500,
  lengths: [10, 20, 40],
  lengthLabel: "qLenL",
  defaults: { clef: "t" },
  lessons: ["buildChord", "chordShapes", "inversions"],
  options: () => [
    {
      key: "clef",
      label: "clefL",
      values: [
        { v: "t", label: "clefT" },
        { v: "b", label: "clefB" },
        { v: "tb", label: "clefBoth" },
      ],
    },
  ],
  question,
  itemLabel,
};
