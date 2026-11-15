// Mini-pieces to sight-read in time: generated from a key, a chord progression and a rhythm
// level, so the patterns of the other exercises really appear (chord tones on strong beats, steps
// in between, broken-chord accompaniments, phrases that repeat). Played with the timed engine
// (js/ui/perform.js): the music never waits. Used by "Morceaux", "Ensemble" and the benchmark.
import { t } from "../i18n.js";
import { inKey, tonic, chordOnDegree, degreeRoot, midiOf, letterOf, intervalOf, pickOne, signature, chordSymbol, qualityOf, ROMAN } from "../theory.js";
import { tempoOf, noteLabel, pitchLabel, NAMES } from "../exercises.js";
import { PROGS } from "./cadences.js";

/** Difficulty steps, from five-finger melodies to Alberti basses and two-part writing. */
export const STEPS = [
  { keys: [0], times: [[4, 4]], cells: ["h", "q"], range: 4, lh: "none", bars: 4 },
  { keys: [0, 1, -1], times: [[4, 4]], cells: ["h", "q"], range: 4, lh: "root", bars: 4 },
  { keys: [0, 1, -1, 2, -2], times: [[4, 4]], cells: ["h", "q", "ee"], range: 4, lh: "block", bars: 4 },
  {
    keys: [0, 1, -1, 2, -2],
    times: [
      [3, 4],
      [4, 4],
    ],
    cells: ["h", "q", "ee"],
    range: 5,
    lh: "broken",
    bars: 4,
  },
  {
    keys: [0, 1, -1, 2, -2, 3, -3],
    times: [
      [3, 4],
      [4, 4],
    ],
    cells: ["h", "q", "ee", "qde"],
    range: 5,
    lh: "alberti",
    bars: 4,
  },
  {
    keys: [0, 1, -1, 2, -2, 3, -3, 4, -4],
    times: [
      [3, 4],
      [4, 4],
    ],
    cells: ["h", "q", "ee", "qde"],
    range: 7,
    lh: "melody",
    bars: 8,
  },
];

const CELLS = { w: [4], hd: [3], h: [2], q: [1], ee: [0.5, 0.5], qde: [1.5, 0.5] };
const len = (c) => CELLS[c].reduce((a, b) => a + b, 0);

/** A bar of rhythm (durations in quarters) from the allowed cells. */
function barRhythm(cells, beats, last) {
  if (last) return [beats];
  const out = [];
  let pos = 0;
  while (pos < beats - 1e-9) {
    const ok = cells.filter((c) => pos + len(c) <= beats && !(len(c) === 2 && beats === 4 && pos % 2));
    out.push(...CELLS[pickOne(ok)]);
    pos = out.reduce((a, b) => a + b, 0);
  }
  return out;
}

/** Degrees for each bar: a known progression, repeated, ending on a V – I cadence. */
function barChords(bars) {
  const code = pickOne(Object.keys(PROGS));
  let p = PROGS[code].slice();
  while (p.length < 4) p.push(1);
  // The loop's first two chords, then a V – I cadence so the piece sounds finished
  // (vi – IV – V – I, I – IV – V – I…); eight bars play the whole loop first.
  const end = [p[0], p[1] === 5 ? 4 : p[1], 5, 1];
  const out = bars >= 8 ? p.slice(0, 4).concat(end) : end.slice(0, bars);
  while (out.length < bars) out.push(1);
  return { code, degs: out };
}

/**
 * Build a piece. cfg: {step (1-6), hands: "both" | "rh" | "lh", style, partner: "none" |
 * "melody" (the app plays the bass) | "accomp" (the app plays the melody) | "duet" (the app adds
 * a top part), tempo}.
 */
export function makePiece(cfg) {
  const S = STEPS[cfg.step - 1],
    style = cfg.style || "plain";
  const time = style === "waltz" ? [3, 4] : pickOne(S.times),
    beats = time[0],
    bars = cfg.bars || S.bars;
  const f = pickOne(S.keys);
  const T = tonic(f);
  // right hand: five-finger position (or wider) from the tonic around middle C
  let t0 = 28 + T.letter;
  if (t0 > 32) t0 -= 7;
  const lo = t0,
    hi = t0 + S.range;
  const { degs } = barChords(bars);

  // ---- right hand melody ----
  const rhythms = [];
  for (let b = 0; b < bars; b++) rhythms.push(barRhythm(S.cells, beats, b === bars - 1));
  if (bars >= 4) rhythms[2] = rhythms[0].slice(); // the second phrase starts like the first
  if (bars >= 8) {
    rhythms[4] = rhythms[0].slice();
    rhythms[5] = rhythms[1].slice();
  }
  const mel = [];
  let prev = t0 + 2;
  for (let b = 0; b < bars; b++) {
    const triad = chordOnDegree(f, degs[b], degreeRoot(f, degs[b], 21)).map((n) => letterOf(n.dn));
    let pos = 0;
    const barNotes = [];
    for (const d of rhythms[b]) {
      const strong = pos === 0 || (beats === 4 && pos === 2);
      let dn;
      if (b === bars - 1) dn = t0 + (prev - t0 > 3 ? 7 <= S.range ? 7 : 0 : 0);
      else if (strong) {
        // the chord tone in range closest to the previous note
        const opts = [];
        for (let x = lo; x <= hi; x++) if (triad.includes(letterOf(x))) opts.push(x);
        opts.sort((a, c) => Math.abs(a - prev) - Math.abs(c - prev) || Math.random() - 0.5);
        dn = opts[Math.random() < 0.75 ? 0 : Math.min(1, opts.length - 1)];
      } else {
        const step = pickOne([1, -1, 1, -1, 0, 2, -2]);
        dn = Math.max(lo, Math.min(hi, prev + step));
      }
      barNotes.push({ d, dn });
      prev = dn;
      pos += d;
    }
    mel.push(barNotes);
  }
  if (bars >= 8) {
    mel[4] = mel[0].map((n) => Object.assign({}, n));
    mel[5] = mel[1].map((n) => Object.assign({}, n));
  }

  // ---- left hand accompaniment ----
  const lhKind = style === "waltz" ? "waltz" : style === "chorale" ? "block" : style === "alberti" ? "alberti" : style === "pop" ? "broken" : S.lh;
  const lh = [];
  for (let b = 0; b < bars; b++) {
    const r = degreeRoot(f, degs[b], 17); // F2 … E3
    const n = (k) => [inKey(f, r + k)];
    const last = b === bars - 1;
    let ev;
    if (lhKind === "none") ev = null;
    else if (last || lhKind === "root") ev = [{ d: beats, notes: n(0) }];
    else if (lhKind === "block") ev = beats === 4 ? [{ d: 2, notes: [n(0)[0], n(2)[0], n(4)[0]] }, { d: 2, notes: [n(0)[0], n(2)[0], n(4)[0]] }] : [{ d: 3, notes: [n(0)[0], n(2)[0], n(4)[0]] }];
    else if (lhKind === "broken") ev = (beats === 4 ? [0, 4, 7, 4] : [0, 4, 7]).map((k) => ({ d: 1, notes: n(k) }));
    else if (lhKind === "alberti") ev = (beats === 4 ? [0, 4, 2, 4, 0, 4, 2, 4] : [0, 4, 2, 4, 2, 4]).map((k) => ({ d: 0.5, notes: n(k) }));
    else if (lhKind === "waltz") {
      // oom-pah-pah: the root, then the chord above it (third and fifth, or fifth and octave)
      const pah = Math.random() < 0.5 ? [n(2)[0], n(4)[0]] : [n(4)[0], n(7)[0]];
      ev = [{ d: 1, notes: n(0) }, { d: 1, notes: pah }, { d: 1, notes: pah.map((x) => ({ dn: x.dn, acc: x.acc })) }];
    }
    else {
      // a second melody: half notes moving by step between chord roots and thirds
      const a = pickOne([0, 2]);
      ev = beats === 4 ? [{ d: 2, notes: n(a) }, { d: 2, notes: n(a === 0 ? pickOne([1, 2, -1]) : 1) }] : [{ d: 2, notes: n(a) }, { d: 1, notes: n(a + pickOne([1, -1])) }];
    }
    lh.push(ev);
  }

  // ---- score and what to play ----
  const rhEvents = [],
    lhEvents = [];
  mel.forEach((bar) => bar.forEach((x) => rhEvents.push({ d: x.d, notes: [inKey(f, x.dn)] })));
  lh.forEach((bar) => bar && bar.forEach((e) => lhEvents.push({ d: e.d, notes: e.notes.map((x) => ({ dn: x.dn, acc: x.acc })) })));
  const partner = cfg.partner || "none",
    hands = lhKind === "none" ? "rh" : cfg.hands || "both";
  const rhPartner = partner === "accomp" || hands === "lh",
    lhPartner = partner === "melody" || hands === "rh";
  // The bass staff is drawn only when there is a left-hand part.
  const staves = [{ clef: "t", partner: rhPartner }];
  const voices = [{ staff: 0, events: rhEvents, partner: rhPartner }];
  if (lhEvents.length) {
    staves.push({ clef: "b", partner: lhPartner });
    voices.push({ staff: 1, events: lhEvents, partner: lhPartner });
  }
  // duet: the app adds a slow top part (chord tones an octave up)
  let descant = null;
  if (partner === "duet") {
    descant = degs.map((d, b) => {
      const tri = chordOnDegree(f, d, degreeRoot(f, d, 35));
      return { d: beats, notes: [tri[b % 2 === 0 ? 2 : 1]] };
    });
    staves.unshift({ clef: "t", partner: true });
    voices.forEach((v) => v.staff++);
    voices.unshift({ staff: 0, events: descant, partner: true });
  }
  const sc = { staves, key: f, time, voices };

  const expected = [],
    partnerNotes = [];
  for (const v of voices) {
    let tq = 0;
    for (const e of v.events) {
      if (!e.rest)
        for (const n of e.notes) {
          const m = midiOf(n);
          if (v.partner) partnerNotes.push({ t: tq, d: e.d, p: m });
          else expected.push({ t: tq, midi: m, ev: e, note: n, zone: "any", item: "pcs:" + cfg.step + ":" + hands, hand: v === voices[voices.length - 1] && lhEvents.length ? "l" : "r" });
        }
      tq += e.d;
    }
  }
  // the interval leading into each right-hand note, to send misses back to the Intervals exercise
  const rh = expected.filter((a) => a.hand === "r").sort((a, b) => a.t - b.t);
  for (let i = 1; i < rh.length; i++) {
    const iv = intervalOf(rh[i - 1].note, rh[i].note);
    if (iv.number > 1 && iv.number <= 8) rh[i].iv = "int:t:" + iv.number + iv.quality + ":" + (iv.dir > 0 ? "up" : "dn");
  }
  // Answers to the study questions, from the way the piece was built.
  const N = NAMES();
  const firstOf = (hand) => {
    const a = expected.filter((x) => x.hand === hand).sort((x, y) => x.t - y.t || x.midi - y.midi)[0];
    return a ? pitchLabel(a.note) : "";
  };
  const answers = {
    key: { name: t("keyMajor", noteLabel(T)), sig: signature(f).map((x) => noteLabel(x)), sharp: f > 0 },
    beats,
    rh: firstOf("r"),
    lh: firstOf("l"),
    chords: degs.map((d) => {
      const c = chordOnDegree(f, d, degreeRoot(f, d, 28));
      return chordSymbol(N, c[0], qualityOf(c));
    }),
    romans: degs.map((d) => ROMAN[d - 1]),
    lhKind: lhEvents.length ? lhKind : "",
    bars,
  };
  return {
    sc,
    scOpts: { staffGap: 6 * 14 },
    hands,
    answers,
    time,
    beats,
    bars,
    tempo: cfg.tempo || 60,
    expected,
    partnerNotes,
    pitched: true,
    keyName: t("keyMajor", noteLabel(T)),
    study: cfg.study === undefined ? 30 : cfg.study,
    fade: cfg.fade || 0,
    clicks: cfg.clicks !== false,
  };
}

// ---------- Morceaux ----------
const pieces = {
  id: "pieces",
  prefix: "pcs",
  kind: "perform",
  levels: STEPS,
  thr: 110,
  lengths: [3, 6],
  lengthLabel: "pieceLenL",
  needsMidi: true,
  needsAudio: true,
  noNames: true,
  defaults: { hands: "both", fade: 0, clicks: "on" },
  lessons: ["studyScore", "keepPulse", "readAhead", "blackKeys"],
  tempoKey: (level) => "pieces:" + level,
  piece(level, p) {
    return makePiece({
      step: level,
      hands: p.hands,
      fade: p.fade,
      clicks: p.clicks !== "off",
      tempo: tempoOf("pieces:" + level, 60),
    });
  },
  options: (p) => [
    {
      key: "hands",
      label: "handsL",
      values: [
        { v: "both", label: "handsBoth" },
        { v: "rh", label: "handR" },
        { v: "lh", label: "handL" },
      ],
      hint: () => (p.hands === "both" ? "handsBothH" : "handsOneH"),
    },
    {
      key: "fade",
      label: "fadeL",
      values: [
        { v: 0, label: "fade0" },
        { v: 1, label: "fade1" },
        { v: 2, label: "fade2" },
      ],
      hint: () => "fade" + (p.fade || 0) + "H",
    },
    {
      key: "clicks",
      label: "clicksL",
      values: [
        { v: "on", label: "clicksOn" },
        { v: "off", label: "clicksOff" },
      ],
    },
  ],
  itemLabel: (key) => {
    const [, step, hands] = key.split(":");
    return t("levelN", Number(step)) + " · " + t(hands === "rh" ? "handR" : hands === "lh" ? "handL" : "handsBoth");
  },
};

// ---------- Ensemble ----------
const STYLES = ["chorale", "waltz", "alberti", "pop"];
const ENS = [
  { partner: "melody", step: 2 },
  { partner: "accomp", step: 3 },
  { partner: "duet", step: 3 },
  { partner: "duet", step: 5 },
];
let styleTurn = 0;
const ensemble = {
  id: "ensemble",
  prefix: "pcs",
  kind: "perform",
  levels: ENS,
  thr: 110,
  lengths: [3, 6],
  lengthLabel: "pieceLenL",
  needsMidi: true,
  needsAudio: true,
  noNames: true,
  defaults: { fade: 0 },
  lessons: ["playTogether", "keepPulse", "studyScore"],
  tempoKey: (level) => "ensemble:" + level,
  piece(level, p) {
    const E = ENS[level - 1];
    const style = STYLES[styleTurn++ % STYLES.length];
    const pc = makePiece({
      step: E.step,
      partner: E.partner,
      style: E.partner === "melody" ? "plain" : style,
      hands: E.partner === "melody" ? "rh" : E.partner === "accomp" ? "lh" : "both",
      fade: p.fade,
      tempo: tempoOf("ensemble:" + level, 60),
    });
    pc.style = E.partner === "melody" ? "" : style;
    pc.expected.forEach((a) => (a.item = "pcs:ens" + level + ":" + (pc.style || "plain")));
    return pc;
  },
  options: (p) => [
    {
      key: "fade",
      label: "fadeL",
      values: [
        { v: 0, label: "fade0" },
        { v: 1, label: "fade1" },
        { v: 2, label: "fade2" },
      ],
      hint: () => "fade" + (p.fade || 0) + "H",
    },
  ],
  itemLabel: (key) => {
    const [, what, style] = key.split(":");
    return t("levelN", Number(what.replace("ens", ""))) + (style && style !== "plain" ? " · " + t("style_" + style) : "");
  },
};

export { pieces, ensemble };
