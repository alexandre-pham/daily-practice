// Intervals: read the distance and direction between notes instead of naming each one.
import { t } from "../i18n.js";
import { midiOf, intervalOf, inKey, rnd, pickOne } from "../theory.js";
import { pickByWeight, noteLabel } from "../exercises.js";
import { known } from "../ui/exrun.js";
import { line, clefPick, RANGE, dirKey, dirWord, ivName, choicesOf, names } from "./common.js";

const LEVELS = [
  { nums: [1, 2, 3] },
  { nums: [2, 3, 4, 5] },
  { nums: [2, 3, 4, 5, 6, 7, 8] },
  { nums: [2, 3, 4, 5, 6, 7, 8], key: true },
  { nums: [2, 3, 4, 5, 6, 7, 8], harmonic: true },
  { contour: true },
];

function candidate(L, clef) {
  const [lo, hi] = RANGE[clef];
  const key = L.key ? pickOne([-4, -3, -2, -1, 1, 2, 3, 4]) : 0;
  const spell = (dn) => (L.key ? inKey(key, dn) : { dn, acc: 0 });
  if (L.contour) {
    const n = 3 + rnd(3),
      steps = [];
    let dn = lo + 2 + rnd(hi - lo - 4);
    const notes = [spell(dn)];
    for (let i = 1; i < n; i++) {
      let s;
      do {
        s = pickOne([1, 1, 1, 2, 2, 3]) * pickOne([1, -1]);
      } while (dn + s < lo || dn + s > hi);
      dn += s;
      steps.push((s > 0 ? "+" : "-") + (Math.abs(s) + 1));
      notes.push(spell(dn));
    }
    return { item: "int:" + clef + ":c" + steps.join(""), notes, key, steps };
  }
  const num = pickOne(L.nums),
    dir = num === 1 ? 0 : L.harmonic ? 1 : pickOne([1, -1]);
  const span = (num - 1) * (dir || 1);
  let a;
  do a = lo + rnd(hi - lo + 1);
  while (a + span < lo || a + span > hi);
  const A = spell(a),
    B = spell(a + span),
    iv = intervalOf(A, B);
  const item = "int:" + clef + ":" + iv.number + iv.quality + ":" + (L.harmonic ? "h" : dirKey(dir));
  return { item, notes: [A, B], key, harmonic: L.harmonic };
}

function question(level, p, prev) {
  const L = LEVELS[level - 1];
  const cands = [];
  for (let i = 0; i < 12; i++) {
    const c = candidate(L, clefPick(p));
    if (!prev || c.item !== prev.item || i > 10) cands.push(Object.assign(c, { clef: c.item.split(":")[1] }));
  }
  const c = pickByWeight(cands, 3000);
  const ms = c.notes.map(midiOf);
  const showName = !known(c.item);
  const sc = c.harmonic
    ? line(c.clef, c.key, [c.notes], { d: 4 })
    : line(c.clef, c.key, c.notes, { labels: showName ? [noteLabel(c.notes[0])] : [] });
  const right = c.steps ? contourLabel(c.steps) : ivName(c.notes[0], c.notes[1], false);
  let wrong;
  if (c.steps) wrong = [1, 2, 3].map(() => contourLabel(c.steps.map((s, i) => (i === rnd(c.steps.length) ? flip(s) : s))));
  else if (c.harmonic) wrong = L.nums.map((n) => t("ivName", n, ""));
  else wrong = L.nums.flatMap((n) => (n === 1 ? [t("ivName", 1, "")] : [t("ivName", n, "") + " ↑", t("ivName", n, "") + " ↓"]));
  return {
    item: c.item,
    sc,
    label: names(c.notes),
    prompt: c.harmonic ? t("int_promptH") : c.steps ? t("int_promptC") : t("int_prompt"),
    promptChoices: c.steps ? t("int_askC") : t("int_ask"),
    maxW: c.steps ? 560 : 420,
    expect: c.harmonic ? { kind: "chord" } : { kind: "seq", notes: ms.map((m) => ({ midi: m })) },
    judge: (got) => {
      const g = c.harmonic ? got : got.slice(0, ms.length);
      const ok = g.length === ms.length && g.every((m, i) => m === [...ms].sort((x, y) => (c.harmonic ? x - y : 0))[i]);
      if (ok) return { ok };
      // same shape somewhere else: right intervals, wrong starting note or octave
      const shape = g.length === ms.length && g.every((m, i) => i === 0 || m - g[i - 1] === ms[i] - ms[i - 1]);
      return { ok: false, shape, got: g };
    },
    choices: choicesOf(c.harmonic ? t("ivName", intervalOf(c.notes[0], c.notes[1]).number, "") : right, wrong),
    fb: (ok, d) => {
      const name = c.steps ? contourLabel(c.steps) : c.harmonic ? t("ivName", intervalOf(c.notes[0], c.notes[1]).number, intervalOf(c.notes[0], c.notes[1]).quality) : ivName(c.notes[0], c.notes[1]);
      if (ok) return name.charAt(0).toUpperCase() + name.slice(1);
      if (d.shape) return t("fbShape") + " " + names(c.notes);
      return t("fbWas", name) + " (" + names(c.notes) + ")";
    },
    mark: ([api], ok, d) => {
      api.events.forEach((e, i) => {
        if (!e._el) return;
        const bad = !ok && d.got && !c.harmonic && d.got[i] !== ms[i];
        e._el.classList.add(ok ? "is-ok" : bad ? "is-bad" : "is-hint");
      });
    },
  };
}
const flip = (s) => (s[0] === "+" ? "-" : "+") + s.slice(1);
const contourLabel = (steps) => steps.map((s) => (s[0] === "+" ? "↑" : "↓") + s.slice(1)).join(" ");

function itemLabel(key) {
  const [, clef, what, dir] = key.split(":");
  const cl = t(clef === "t" ? "clefNameT" : "clefNameB");
  if (what[0] === "c") return contourLabel(what.slice(1).match(/[+-]\d/g) || []) + " · " + cl;
  const n = parseInt(what, 10),
    q = what.replace(/^\d+/, "");
  return t("ivName", n, q) + (dir === "h" ? " (" + t("harmonicW") + ")" : dir === "eq" ? "" : " " + dirWord(dir === "up" ? 1 : -1)) + " · " + cl;
}

export default {
  id: "intervals",
  prefix: "int",
  kind: "quiz",
  levels: LEVELS,
  thr: 3000,
  lengths: [10, 20, 40],
  lengthLabel: "qLenL",
  defaults: { clef: "t" },
  lessons: ["intervals", "staffSteps"],
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
