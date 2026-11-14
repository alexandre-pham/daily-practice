// Rhythm reading: one or two bars on a one-line staff, tapped in time against the metronome.
// Bars are built from rhythm cells of one or two beats (a quarter, two quavers, a dotted quarter
// and a quaver…), so common units come back and are learned as blocks. Statistics are kept per
// cell; the timing error (ms) is what decides whether a cell is solid.
import { t } from "../i18n.js";
import { pickOne } from "../theory.js";
import { pickByWeight, tempoOf, setTempo, latency } from "../exercises.js";
import { el } from "../util.js";
import { group, chip } from "../ui/exhome.js";
import { startCalibration } from "../ui/perform.js";

// Cells: durations in quarter notes; kind n = note, r = rest, t = note tied to the next one,
// c = the tied continuation (no new attack).
export const CELLS = {
  w: [[4, "n"]],
  hd: [[3, "n"]],
  h: [[2, "n"]],
  q: [[1, "n"]],
  r1: [[1, "r"]],
  r2: [[2, "r"]],
  ee: [
    [0.5, "n"],
    [0.5, "n"],
  ],
  qde: [
    [1.5, "n"],
    [0.5, "n"],
  ],
  re: [
    [0.5, "r"],
    [0.5, "n"],
  ],
  er: [
    [0.5, "n"],
    [0.5, "r"],
  ],
  eqe: [
    [0.5, "n"],
    [1, "n"],
    [0.5, "n"],
  ],
  etie: [
    [0.5, "n"],
    [0.5, "t"],
    [0.5, "c"],
    [0.5, "n"],
  ],
  ssss: [
    [0.25, "n"],
    [0.25, "n"],
    [0.25, "n"],
    [0.25, "n"],
  ],
  ess: [
    [0.5, "n"],
    [0.25, "n"],
    [0.25, "n"],
  ],
  sse: [
    [0.25, "n"],
    [0.25, "n"],
    [0.5, "n"],
  ],
  eds: [
    [0.75, "n"],
    [0.25, "n"],
  ],
};
export const cellLen = (id) => CELLS[id].reduce((s, x) => s + x[0], 0);

export const LEVELS = [
  { cells: ["w", "h", "q"], times: [[4, 4]] },
  { cells: ["w", "h", "q", "r1", "r2"], times: [[4, 4]] },
  {
    cells: ["h", "q", "r1", "r2"],
    times: [
      [2, 4],
      [3, 4],
      [4, 4],
    ],
  },
  {
    cells: ["h", "q", "r1", "ee"],
    times: [
      [2, 4],
      [3, 4],
      [4, 4],
    ],
  },
  {
    cells: ["h", "hd", "q", "r1", "ee", "qde"],
    times: [
      [3, 4],
      [4, 4],
    ],
  },
  {
    cells: ["h", "q", "r1", "ee", "qde", "re", "er", "eqe", "etie"],
    times: [
      [2, 4],
      [3, 4],
      [4, 4],
    ],
  },
  {
    cells: ["q", "ee", "qde", "ssss", "ess", "sse", "eds", "re"],
    times: [
      [2, 4],
      [4, 4],
    ],
  },
  { two: true, cells: ["h", "q", "r1", "ee", "qde"], times: [[4, 4]] },
];

/** Where a cell may start in the bar: no cell across the middle of a 4/4 bar, a whole note at the start. */
function fits(id, pos, beats) {
  const len = cellLen(id);
  if (pos + len > beats) return false;
  if (id === "w") return pos === 0 && beats === 4;
  if (id === "hd") return pos === 0 && beats >= 3;
  if (beats === 4 && len === 2) return pos === 0 || pos === 2;
  return true;
}

/** Cells for a number of beats, picked by their statistics. */
function fill(cells, beats, prefix, used) {
  const out = [];
  let pos = 0;
  while (pos < beats - 1e-9) {
    const ok = cells.filter((id) => fits(id, pos, beats));
    const pick = pickByWeight(ok.map((id) => ({ id, item: prefix + id })), 70);
    out.push(pick.id);
    used.push(pick.id);
    pos += cellLen(pick.id);
  }
  return out;
}

/** A rhythm exercise with something to play: at least one attack per bar. */
function piece(level, p) {
  let pc;
  for (let i = 0; i < 20; i++) {
    pc = makePiece(level, p);
    if (pc.expected.length >= pc.bars + 1) break;
  }
  return pc;
}

/** A rhythm exercise: bars of cells, the score, and the attacks to tap. */
function makePiece(level, p) {
  const L = LEVELS[level - 1],
    time = pickOne(L.times),
    beats = time[0],
    bars = 2;
  const tempo = tempoOf("rhythm:" + level, 60);
  if (!L.two) {
    const cells = [],
      used = [];
    for (let b = 0; b < bars; b++) cells.push(...fill(L.cells, beats, "rhy:", used));
    const voice = build(cells);
    return {
      sc: { staves: [{ clef: "p" }], time, voices: [{ staff: 0, events: voice.events }] },
      time,
      beats,
      bars,
      tempo,
      expected: voice.attacks.map((a) => Object.assign(a, { zone: "any" })),
    };
  }
  // Two hands: the bar is split into two-beat segments; each hand gets its own cells.
  const r = [],
    l = [],
    pairs = [];
  for (let b = 0; b < bars; b++)
    for (let s = 0; s < beats; s += 2) {
      let rc, lc;
      do {
        rc = fill(L.cells, 2, "rhy2:", []);
        lc = fill(L.cells, 2, "rhy2:", []);
      } while (rc.join() === lc.join() && Math.random() < 0.8);
      r.push(...rc);
      l.push(...lc);
      pairs.push(rc.join("_") + "." + lc.join("_"));
    }
  const R = build(r),
    Lh = build(l);
  // statistics per two-beat pair of cells
  const segOf = (tq) => Math.floor(tq / 2);
  const expected = [
    ...R.attacks.map((a) => Object.assign(a, { zone: "hi", item: "rhy2:" + pairs[segOf(a.t)] })),
    ...Lh.attacks.map((a) => Object.assign(a, { zone: "lo", item: "rhy2:" + pairs[segOf(a.t)] })),
  ].sort((a, b) => a.t - b.t);
  return {
    sc: {
      staves: [{ clef: "p" }, { clef: "p" }],
      time,
      voices: [
        { staff: 0, events: R.events },
        { staff: 1, events: Lh.events },
      ],
    },
    scOpts: { staffGap: 3 * 14 },
    time,
    beats,
    bars,
    tempo,
    expected,
    twoHands: true,
  };
}

/** Score events and attacks for a list of cells. */
export function build(cells) {
  const events = [],
    attacks = [];
  let tq = 0;
  for (const id of cells) {
    for (const [d, kind] of CELLS[id]) {
      const e = { d, notes: kind === "r" ? [] : [{ dn: 24, acc: 0 }], rest: kind === "r", tie: kind === "t" };
      events.push(e);
      if (kind === "n" || kind === "t") attacks.push({ t: tq, ev: e, item: "rhy:" + id });
      tq += d;
    }
  }
  return { events, attacks };
}

function itemLabel(key) {
  const [pre, what] = key.split(":");
  if (pre === "rhy2") {
    const [a, b] = what.split(".");
    return t("handR") + " " + a.split("_").map((c) => t("cell_" + c)).join(" + ") + " / " + t("handL") + " " + b.split("_").map((c) => t("cell_" + c)).join(" + ");
  }
  return t("cell_" + what);
}

export default {
  id: "rhythm",
  prefix: "rhy",
  kind: "perform",
  levels: LEVELS,
  thr: 70, // ms of average timing error for a solid cell
  lengths: [4, 8],
  lengthLabel: "exLenL",
  lessons: ["countBeats", "noteValues", "rhythmCells", "keepPulse"],
  noNames: true,
  buttonsHint: "rhy_buttonsH",
  piece,
  itemLabel,
  tempoKey: (level) => "rhythm:" + level,
  /** Tempo of the current level (it also adapts after each round) and the latency calibration. */
  extraSetup(p, rerender) {
    const box = el("div");
    const key = "rhythm:" + p.level,
      bpm = tempoOf(key, 60);
    const set = (v) => () => {
      setTempo(key, v);
      rerender();
    };
    box.appendChild(group(t("tempoL"), [chip("−", false, set(bpm - 4), { "aria-label": t("slower") }), el("span", "tempo-val", "♩ = " + bpm), chip("+", false, set(bpm + 4), { "aria-label": t("faster") })], t("tempoH")));
    const cal = el("button", "btn2", t("calBtn"));
    cal.type = "button";
    cal.addEventListener("click", () => startCalibration(rerender));
    box.appendChild(group(t("latencyL"), [cal], t("latencyH", latency())));
    return box;
  },
};
