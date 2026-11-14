// Key signatures: name the key from its signature, then play its tonic or scale.
import { t } from "../i18n.js";
import { tonic, signature } from "../theory.js";
import { pickByWeight, noteLabel } from "../exercises.js";
import { clefPick, choicesOf } from "./common.js";

const RANGES = [2, 4, 7, 5, 4];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0];

const keyCode = (f) => (f === 0 ? "0" : Math.abs(f) + (f > 0 ? "s" : "f"));
const keyNames = (f) => {
  const M = tonic(f),
    m = tonic(f, true);
  return { major: t("keyMajor", noteLabel(M)), minor: t("keyMinor", noteLabel(m)) };
};

function question(level, p, prev) {
  const R = RANGES[level - 1],
    minor = level === 4,
    scale = level === 5;
  const suffix = minor ? ":min" : scale ? ":scale" : "";
  const cands = [];
  for (let f = -R; f <= R; f++) if (!prev || prev.f !== f) cands.push({ f, item: "key:" + keyCode(f) + suffix });
  const c = pickByWeight(cands, scale ? 15000 : 3000);
  const f = c.f,
    clef = clefPick(p);
  const T = tonic(f, minor);
  const nm = keyNames(f);
  const sig = signature(f).map((s) => noteLabel(s)).join(" ");
  // Distractors from neighbouring signatures, so the answer means counting the accidentals.
  const near = [];
  for (let d = -R; d <= R; d++) if (d !== f) near.push(d);
  near.sort((a, b) => Math.abs(a - f) - Math.abs(b - f) || Math.random() - 0.5);
  const alts = near.slice(0, 5).map((d) => (minor ? keyNames(d).minor : keyNames(d).major));
  return {
    f,
    item: c.item,
    sc: { staves: [{ clef }], key: f, voices: [] },
    maxW: 260,
    label: t("keySigAria", Math.abs(f), f >= 0),
    prompt: scale ? t("keys_promptScale") : minor ? t("keys_promptMinor") : t("keys_prompt"),
    promptChoices: minor ? t("keys_askMinor") : t("keys_ask"),
    expect: scale ? { kind: "seq", rel: MAJOR_SCALE, pc0: pcOfTonic(T), step: true } : { kind: "seq", notes: [{ pc: pcOfTonic(T) }] },
    choices: choicesOf(minor ? nm.minor : nm.major, alts),
    choicesHint: scale ? "keys_scaleButtons" : "",
    fb: (ok, d) => {
      const what = nm.major + " / " + nm.minor + " — " + (sig || t("noAccidentals"));
      if (ok || !scale || !d.notes) return (ok ? "" : t("fbWasPlain") + " ") + what;
      return t("scaleMissAt", d.at + 1) + " " + what;
    },
    hint: scale ? t("keys_scaleHint") : "",
  };
}
const pcOfTonic = (T) => (([0, 2, 4, 5, 7, 9, 11][T.letter] + T.acc + 12) % 12);

function itemLabel(key) {
  const [, code, kind] = key.split(":");
  const f = code === "0" ? 0 : parseInt(code, 10) * (code.endsWith("f") ? -1 : 1);
  const nm = keyNames(f);
  return kind === "min" ? nm.minor : kind === "scale" ? t("scaleOf", nm.major) : nm.major;
}

export default {
  id: "keys",
  prefix: "key",
  kind: "quiz",
  levels: RANGES,
  thr: 3000,
  lengths: [10, 20],
  lengthLabel: "qLenL",
  defaults: { clef: "t" },
  lessons: ["keySigs", "relMinor"],
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
