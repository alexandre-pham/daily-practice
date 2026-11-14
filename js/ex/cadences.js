// Cadences and progressions: play common chord sequences as blocks, or recognise them on the page.
import { t } from "../i18n.js";
import { tonic, chordOnDegree, degreeRoot, pcSet, sameSet, chordSymbol, qualityOf, ROMAN } from "../theory.js";
import { pickByWeight, NAMES, noteLabel } from "../exercises.js";
import { choicesOf } from "./common.js";

export const PROGS = {
  1451: [1, 4, 5, 1],
  1564: [1, 5, 6, 4],
  6415: [6, 4, 1, 5],
  1645: [1, 6, 4, 5],
  251: [2, 5, 1],
};
const LEVELS = [
  { progs: ["1451"], keys: [0, 1, -1] },
  { progs: ["1451", "1564", "6415"], keys: [-2, -1, 0, 1, 2] },
  { progs: Object.keys(PROGS), keys: [-4, -3, -2, -1, 0, 1, 2, 3, 4] },
  { progs: Object.keys(PROGS), keys: [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] },
];
/** Circle of fifths, for "all keys": C G D A E B F♯ then the flat side. */
const CYCLE = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];
const keyCode = (f) => (f === 0 ? "0" : Math.abs(f) + (f > 0 ? "s" : "f"));
const keyName = (f) => t("keyMajor", noteLabel(tonic(f)));
export const progLabel = (code) => PROGS[code].map((d) => ROMAN[d - 1]).join(" – ");

/** Triads of a progression, the right hand voice-led around middle C, the bass on the root. */
export function voiceProg(f, degs) {
  let prev = null;
  return degs.map((d) => {
    const triad = chordOnDegree(f, d, degreeRoot(f, d, 28));
    // the inversion closest to the previous chord (first chord: root position from C4 up)
    let best = triad;
    if (prev) {
      let bestCost = Infinity;
      for (const shift of [-7, 0]) {
        for (let inv = 0; inv < 3; inv++) {
          const v = triad.map((n, i) => ({ dn: n.dn + shift + (i < inv ? 7 : 0), acc: n.acc })).sort((a, b) => a.dn - b.dn);
          const cost = v.reduce((s, n, i) => s + Math.abs(n.dn - prev[i].dn), 0) + (v[0].dn < 26 || v[2].dn > 38 ? 20 : 0);
          if (cost < bestCost) {
            bestCost = cost;
            best = v;
          }
        }
      }
    }
    prev = best;
    const root = degreeRoot(f, d, 17); // F2 … E3: on the bass staff
    return { rh: best, bass: { dn: root, acc: triad[0].acc }, triad };
  });
}

function question(level, p, prev) {
  const L = LEVELS[level - 1],
    mode = p.mode || "play";
  let f, code;
  if (mode === "cycle") {
    code = p.prog && PROGS[p.prog] ? p.prog : "1451";
    const i = prev && prev.cycleI !== undefined ? (prev.cycleI + 1) % CYCLE.length : 0;
    f = CYCLE[i];
    return build(code, f, mode, i);
  }
  const cands = [];
  const progs = p.prog && PROGS[p.prog] && L.progs.includes(p.prog) ? [p.prog] : L.progs;
  for (const c of progs) for (const k of L.keys) cands.push({ code: c, f: k, item: "cad:" + c + ":" + keyCode(k) + (mode === "recog" ? ":r" : "") });
  const pick = pickByWeight(
    cands.filter((x) => !prev || x.item !== prev.item),
    9000,
  );
  code = pick.code;
  f = pick.f;
  return build(code, f, mode);
}

function build(code, f, mode, cycleI) {
  const degs = PROGS[code],
    N = NAMES();
  const chords = degs.map((d) => chordOnDegree(f, d, degreeRoot(f, d, 28)));
  const syms = chords.map((c) => chordSymbol(N, c[0], qualityOf(c)));
  const reveal = keyName(f) + " : " + syms.join(" – ");
  const item = "cad:" + code + ":" + keyCode(f) + (mode === "recog" ? ":r" : "");
  if (mode === "recog") {
    const v = voiceProg(f, degs);
    return {
      item,
      sc: {
        staves: [{ clef: "t" }, { clef: "b" }],
        key: f,
        voices: [
          { staff: 0, events: v.map((c) => ({ d: 4, notes: c.rh })) },
          { staff: 1, events: v.map((c) => ({ d: 4, notes: [c.bass] })) },
        ],
      },
      prompt: t("cad_askRecog"),
      expect: { kind: "none" },
      choices: choicesOf(progLabel(code), Object.keys(PROGS).map(progLabel), 5),
      fb: (ok) => (ok ? progLabel(code) + " — " + reveal : t("fbWas", progLabel(code)) + " — " + reveal),
      mark: (apis, ok) => apis[0].events.forEach((e) => e._el && e._el.classList.add(ok ? "is-ok" : "is-hint")),
    };
  }
  const prompt = keyName(f) + " : " + degs.map((d) => ROMAN[d - 1]).join(" – ");
  return {
    item,
    cycleI,
    sc: { staves: [{ clef: "t" }], key: f, voices: [] },
    maxW: 260,
    prompt,
    promptChoices: prompt + " ?",
    hint: t("cad_playHint"),
    expect: { kind: "chords", count: degs.length },
    judgeStep: (got, i) => ({ ok: sameSet(pcSet(got), pcSet(chords[i])) }),
    onStep: (apis, i, ok, ui) => {
      ui.fb.className = "read-fb" + (ok ? " ok" : "");
      ui.fb.textContent = syms.slice(0, i + 1).join(" – ") + (ok ? " ✓" : "");
    },
    // Without a piano: name the chords.
    choices: choicesOf(
      syms.join(" – "),
      [1, -1, 2, -2].map((delta) => {
        const k = Math.max(-6, Math.min(6, f + delta));
        return degs
          .map((d) => {
            const c = chordOnDegree(k, d, degreeRoot(k, d, 28));
            return chordSymbol(N, c[0], qualityOf(c));
          })
          .join(" – ");
      }),
    ),
    fb: (ok, d) => (ok ? reveal : (d && d.at !== undefined ? t("cad_missAt", d.at + 1) + " " : "") + reveal),
    msFromFirst: false,
    extraDelay: 600,
  };
}

function itemLabel(key) {
  const [, code, k, r] = key.split(":");
  const f = k === "0" ? 0 : parseInt(k, 10) * (k.endsWith("f") ? -1 : 1);
  return keyName(f) + " : " + (PROGS[code] ? progLabel(code) : code) + (r ? " (" + t("cad_recog") + ")" : "");
}

export default {
  id: "cadences",
  prefix: "cad",
  kind: "quiz",
  levels: LEVELS,
  thr: 9000,
  lengths: [6, 12, 24],
  lengthLabel: "qLenL",
  defaults: { mode: "play", prog: "any" },
  lessons: ["progressions", "tendency", "degrees"],
  options: (p) => [
    {
      key: "mode",
      label: "modeL",
      values: [
        { v: "play", label: "cad_play" },
        { v: "recog", label: "cad_recog" },
        { v: "cycle", label: "cad_cycle" },
      ],
      hint: () => "cad_" + (p.mode || "play") + "H",
    },
    {
      key: "prog",
      label: "cad_progL",
      values: [{ v: "any", label: "cad_any" }].concat(Object.keys(PROGS).map((c) => ({ v: c, label: "prog_" + c }))),
    },
  ],
  question,
  itemLabel,
};
