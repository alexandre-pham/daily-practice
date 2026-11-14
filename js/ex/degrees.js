// Degrees: link a chord's name in a key (I, IV, V…) to the notes under the fingers.
import { t } from "../i18n.js";
import { tonic, chordOnDegree, degreeRoot, pcSet, sameSet, chordSymbol, qualityOf, placeFrom, ROMAN } from "../theory.js";
import { pickByWeight, NAMES, noteLabel } from "../exercises.js";
import { choicesOf, names } from "./common.js";

const LEVELS = [
  { keys: [0, 1, -1], degs: [1, 4, 5] },
  { keys: [0, 1, -1], degs: [1, 4, 5, 6] },
  { keys: [0, 1, -1, 2, -2], degs: [1, 2, 3, 4, 5, 6] },
  { keys: [-4, -3, -2, -1, 0, 1, 2, 3, 4], degs: [1, 2, 3, 4, 5, 6] },
  { keys: [-4, -3, -2, -1, 0, 1, 2, 3, 4], degs: [1, 2, 3, 4, 5, 6, 57] },
];
const keyCode = (f) => (f === 0 ? "0" : Math.abs(f) + (f > 0 ? "s" : "f"));
const roman = (d) => (d === 57 ? "V7" : ROMAN[d - 1]);
const keyName = (f) => t("keyMajor", noteLabel(tonic(f)));

function question(level, p, prev) {
  const L = LEVELS[level - 1],
    rev = p.mode === "name";
  const cands = [];
  for (const f of L.keys) for (const d of L.degs) if (!prev || prev.item !== "deg:" + keyCode(f) + ":" + d + (rev ? ":r" : "")) cands.push({ f, d, item: "deg:" + keyCode(f) + ":" + d + (rev ? ":r" : "") });
  const c = pickByWeight(cands, 4000);
  const seventh = c.d === 57,
    deg = seventh ? 5 : c.d;
  const notes = chordOnDegree(c.f, deg, degreeRoot(c.f, deg, 28), seventh);
  const N = NAMES(),
    sym = chordSymbol(N, notes[0], qualityOf(notes));
  const what = keyName(c.f) + " — " + roman(c.d) + " = " + sym + " (" + names(notes) + ")";
  const base = {
    item: c.item,
    fb: (ok) => (ok ? what : t("fbWas", what)),
    mark: (apis, ok) => apis[0].events.forEach((e) => e._el && e._el.classList.add(ok ? "is-ok" : "is-hint")),
  };
  if (rev) {
    // A chord drawn under a key signature: name its degree.
    const shown = placeFrom(notes, 28 + Math.floor(Math.random() * 4));
    return Object.assign(base, {
      sc: { staves: [{ clef: "t" }], key: c.f, voices: [{ staff: 0, events: [{ d: 4, notes: shown }] }] },
      maxW: 300,
      prompt: t("deg_askRev", keyName(c.f)),
      expect: { kind: "none" },
      choices: choicesOf(roman(c.d), L.degs.map(roman), 6),
    });
  }
  const wrong = L.degs.filter((d) => d !== c.d).map((d) => {
    const n = chordOnDegree(c.f, d === 57 ? 5 : d, degreeRoot(c.f, d === 57 ? 5 : d, 28), d === 57);
    return chordSymbol(N, n[0], qualityOf(n));
  });
  return Object.assign(base, {
    sc: { staves: [{ clef: "t" }], key: c.f, voices: [] },
    maxW: 260,
    prompt: keyName(c.f) + " — " + roman(c.d),
    promptChoices: keyName(c.f) + " — " + roman(c.d) + " ?",
    hint: t("deg_playHint"),
    expect: { kind: "chord" },
    judge: (got) => ({ ok: sameSet(pcSet(got), pcSet(notes)) }),
    choices: choicesOf(sym, wrong),
  });
}

function itemLabel(key) {
  const [, code, d, r] = key.split(":");
  const f = code === "0" ? 0 : parseInt(code, 10) * (code.endsWith("f") ? -1 : 1);
  return keyName(f) + " — " + roman(Number(d)) + (r ? " (" + t("deg_nameMode") + ")" : "");
}

export default {
  id: "degrees",
  prefix: "deg",
  kind: "quiz",
  levels: LEVELS,
  thr: 4000,
  lengths: [10, 20, 40],
  lengthLabel: "qLenL",
  defaults: { mode: "play" },
  lessons: ["degrees", "buildChord"],
  options: () => [
    {
      key: "mode",
      label: "modeL",
      values: [
        { v: "play", label: "deg_playMode" },
        { v: "name", label: "deg_nameMode" },
      ],
      hint: (p) => (p.mode === "name" ? "deg_nameH" : "deg_playH"),
    },
  ],
  question,
  itemLabel,
};
