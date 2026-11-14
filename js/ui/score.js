// Engraves short scores as SVG for the reading exercises: one or more staves (treble, bass, or a
// one-line rhythm staff), key signature, time signature, notes and rests from the whole note to
// the semiquaver, dots, ties, beams, chords with seconds and accidentals, barlines, and line breaks
// into systems. DOM calls only (the CSP enforces Trusted Types). Glyphs come from Bravura.
//
// Durations are in quarter notes: 4 whole, 3 dotted half, 2 half, 1.5 dotted quarter, 1 quarter,
// 0.75 dotted quaver, 0.5 quaver, 0.25 semiquaver.
import { GLYPH, GW } from "../glyphs.js";
import { keyAcc, letterOf } from "../theory.js";

const NS = "http://www.w3.org/2000/svg";
const S = 14; // staff space
const K = S / 250; // glyph units → SVG units
const STEM = 3.5 * S;
const BOTTOM = { t: 30, b: 18, p: 24 }; // diatonic number of the bottom line (p: one-line staff, line = middle)
const HEAD = { w: GW.wholeNote * K, h: GW.halfNote * K, q: GW.blackNote * K };
const ACC_W = GW.sharp * K + 3;
const SHARP_POS = { t: [38, 35, 39, 36, 33, 37, 34], b: [24, 21, 25, 22, 19, 23, 20] };
const FLAT_POS = { t: [34, 37, 33, 36, 32, 35, 31], b: [20, 23, 19, 22, 18, 21, 17] };

function node(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function glyph(d, x, y, parent, cls, sx = 1, sy = sx) {
  return node("path", { d, class: "g" + (cls ? " " + cls : ""), transform: "translate(" + r(x) + " " + r(y) + ") scale(" + K * sx + " " + -K * sy + ")" }, parent);
}
const r = (v) => Math.round(v * 100) / 100;

/** Gap after a column, from the time to the next column (in quarters): longer notes take more room. */
const gapFor = (dq) => 24 + 19 * Math.log2(1 + dq * 2);

function headKind(d) {
  if (d >= 4) return "w";
  if (d >= 2) return "h";
  return "q";
}
const dotted = (d) => [3, 1.5, 0.75, 0.375].includes(d);
const beams = (d) => (d < 0.5 ? 2 : d < 1 ? 1 : 0);

/**
 * @param {object} sc
 *   staves: [{clef:"t"|"b"|"p", partner?:bool}], key: fifths, time: [n, d] | null,
 *   voices: [{staff, stem?: "up"|"down", partner?: bool, events: [{d, rest?, notes:[{dn, acc, cls}], cls, tie, label}]}]
 * @param {object} o  width (target width in SVG units), even (equal spacing, no time), gap, label, justify
 * @returns {{svg, at(q), events, bars, total, setCursor(q), clearCursor()}}
 */
export function score(sc, o = {}) {
  const staves = sc.staves,
    key = sc.key || 0,
    time = sc.time || null,
    barLen = time ? (time[0] * 4) / time[1] : Infinity,
    nst = staves.length,
    staffGap = o.staffGap || 7 * S,
    brace = nst > 1 && !o.noBrace;

  // ---- timing: onsets for every event ----
  let total = 0;
  for (const v of sc.voices) {
    let t = 0;
    for (const e of v.events) {
      e._t = t;
      t += e.d;
    }
    total = Math.max(total, t);
  }
  const nbars = time ? Math.max(1, Math.ceil(total / barLen - 1e-9)) : 1;
  const barOfT = (t) => (time ? Math.min(nbars - 1, Math.floor(t / barLen + 1e-9)) : 0);

  // ---- columns per bar ----
  const bars = [];
  for (let b = 0; b < nbars; b++) bars.push({ i: b, start: time ? b * barLen : 0, end: time ? (b + 1) * barLen : total, cols: [] });
  const colMap = new Map();
  for (const v of sc.voices)
    for (const e of v.events) {
      const k = e._t.toFixed(4);
      if (!colMap.has(k)) colMap.set(k, { t: e._t, evs: [], acc: false, dot: false });
      const c = colMap.get(k);
      c.evs.push(e);
      if (dotted(e.d)) c.dot = true;
    }
  [...colMap.values()].sort((a, b) => a.t - b.t).forEach((c) => bars[barOfT(c.t)].cols.push(c));

  // Accidentals shown: the key's, then whatever earlier notes in the bar changed (per staff).
  for (const bar of bars) {
    const perStaff = staves.map(() => ({}));
    for (const c of bar.cols)
      for (const v of sc.voices) {
        const e = c.evs.find((x) => v.events.includes(x));
        if (!e || e.rest) continue;
        const m = perStaff[v.staff];
        for (const n of e.notes) {
          const now = n.dn in m ? m[n.dn] : keyAcc(key, letterOf(n.dn));
          n._show = (n.acc || 0) !== now || n.forceAcc;
          if (n._show) c.acc = true;
          m[n.dn] = n.acc || 0;
        }
      }
  }

  // Natural widths.
  for (const bar of bars) {
    let x = 10;
    bar.cols.forEach((c, i) => {
      if (c.acc) x += ACC_W + (c.evs.some((e) => !e.rest && e.notes.filter((n) => n._show).length > 1) ? ACC_W : 0);
      c.x = x;
      const next = i + 1 < bar.cols.length ? bar.cols[i + 1].t : bar.end;
      c.gap = o.even ? o.gap || 46 : gapFor(Math.max(0.25, next - c.t));
      if (c.dot) c.gap += 6;
      if (c.evs.some((e) => e.d >= 4 && !e.rest)) c.gap = Math.max(c.gap, HEAD.w + 16);
      x += c.gap;
    });
    bar.w = x + 4;
  }

  // ---- header and systems ----
  const nkey = Math.abs(key),
    headerW = (brace ? 14 : 0) + 50 + (staves.some((s) => s.clef !== "p") ? nkey * 15 : 0) + 6;
  const timeW = time ? 34 : 0;
  const width = Math.max(o.width || 0, 200);
  const systems = [];
  let curSys = null;
  for (const bar of bars) {
    const head = headerW + (systems.length === 0 && !curSys ? timeW : 0);
    if (!curSys || (o.wrap !== false && curSys.w + bar.w > width && curSys.bars.length)) {
      curSys = { bars: [], w: head, head };
      systems.push(curSys);
    }
    curSys.bars.push(bar);
    curSys.w += bar.w;
  }
  const sysH = 6 * S + nst * 4 * S + (nst - 1) * staffGap + (o.labels ? 18 : 0);
  const natural = Math.max(...systems.map((s) => s.w)) + 6;
  // Content wider than asked for (a line that cannot break) widens the drawing rather than being cut off.
  const svgW = o.width ? Math.max(width, natural) : natural;
  const H = systems.length * sysH + (systems.length - 1) * 2 * S;

  const svg = node("svg", { viewBox: "0 0 " + r(svgW) + " " + r(H), class: "staff score" + (o.cls ? " " + o.cls : ""), role: "img" });
  if (o.label) svg.setAttribute("aria-label", o.label);
  const back = node("g", { class: "back" }, svg);

  const api = { svg, total, bars, systems, events: [], barGroups: [] };

  systems.forEach((sys, si) => {
    const y0 = si * (sysH + 2 * S);
    sys.y0 = y0;
    sys.h = sysH;
    const top = (k) => y0 + 3 * S + k * (4 * S + staffGap);
    sys.top = top;
    const x0 = brace ? 14 : 0;
    // justify
    const natural = sys.w,
      last = si === systems.length - 1,
      stretch = o.width && (o.justify !== false) && !(last && natural < width * 0.6 && systems.length > 1) ? (width - 2 - natural) : 0;
    const gaps = sys.bars.reduce((s, b) => s + b.cols.reduce((a, c) => a + c.gap, 0), 0) || 1;
    let x = x0 + sys.head;
    // staff lines
    const lines = node("g", { class: "lines" }, svg);
    const xEnd = o.width && stretch > 0 ? width - 2 : x0 + natural;
    staves.forEach((st, k) => {
      if (st.clef === "p") node("line", { x1: x0 + 2, x2: r(xEnd), y1: top(k) + 2 * S, y2: top(k) + 2 * S }, lines);
      else for (let i = 0; i < 5; i++) node("line", { x1: x0 + 2, x2: r(xEnd), y1: top(k) + i * S, y2: top(k) + i * S }, lines);
    });
    // system start line and brace
    const solo = nst === 1 && staves[0].clef === "p",
      yA = top(0) + (solo ? S : 0),
      yB = top(nst - 1) + (solo ? 3 * S : 4 * S);
    if (nst > 1) node("line", { class: "barline", x1: x0 + 2, x2: x0 + 2, y1: yA, y2: yB }, svg);
    if (brace) glyph(GLYPH.brace, 2, yB, svg, "brace", 2.4, (yB - yA) / (4 * S));
    // clefs, key, time
    staves.forEach((st, k) => {
      const tp = top(k),
        cl = node("g", { class: st.partner ? "partner" : "" }, svg);
      if (st.clef === "t") glyph(GLYPH.gClef, x0 + 8, tp + 3 * S, cl, "clef");
      else if (st.clef === "b") glyph(GLYPH.fClef, x0 + 8, tp + S, cl, "clef");
      else {
        node("rect", { class: "clef", x: x0 + 14, y: tp + S, width: 3.5, height: 2 * S }, cl);
        node("rect", { class: "clef", x: x0 + 21, y: tp + S, width: 3.5, height: 2 * S }, cl);
      }
      if (st.clef !== "p" && key) {
        const pos = key > 0 ? SHARP_POS[st.clef] : FLAT_POS[st.clef],
          g = key > 0 ? GLYPH.sharp : GLYPH.flat;
        for (let i = 0; i < nkey; i++) glyph(g, x0 + 50 + i * 15, yOf(st.clef, pos[i], tp), cl, "acc");
      }
      if (time && si === 0) {
        const tx = x0 + headerW;
        digits(cl, String(time[0]), tx, tp + S);
        digits(cl, String(time[1]), tx, tp + 3 * S);
      }
    });

    for (const bar of sys.bars) {
      const share = stretch > 0 ? stretch / gaps : 0;
      bar.sys = si;
      bar.x0 = x;
      const g = node("g", { class: "bar" }, svg);
      api.barGroups[bar.i] = g;
      // positions with stretched gaps
      let cx = x + 10;
      bar.cols.forEach((c) => {
        if (c.acc) cx += ACC_W + (c.evs.some((e) => !e.rest && e.notes.filter((n) => n._show).length > 1) ? ACC_W : 0);
        c.X = cx;
        cx += c.gap * (1 + share);
      });
      x = cx + 4;
      bar.x1 = x;
      // barline
      if (time) {
        const isLast = bar.i === nbars - 1;
        if (isLast && o.final !== false) {
          node("line", { class: "barline", x1: x - 6, x2: x - 6, y1: yA, y2: yB }, g);
          node("rect", { class: "barend", x: x - 3, y: yA, width: 3.5, height: yB - yA }, g);
        } else node("line", { class: "barline", x1: x - 1, x2: x - 1, y1: yA, y2: yB }, g);
      }
      // events
      for (const v of sc.voices) {
        const evs = v.events.filter((e) => barOfT(e._t) === bar.i);
        drawVoice(g, v, evs, bar, staves[v.staff].clef, top(v.staff), api);
      }
    }
    sys.x1 = x;
  });

  // ---- time → position ----
  const colsAll = [];
  bars.forEach((b) => b.cols.forEach((c) => colsAll.push(c)));
  api.at = (q) => {
    const b = bars[barOfT(Math.max(0, Math.min(q, total - 1e-6)))];
    const cols = b.cols;
    let prevT = b.start,
      prevX = cols.length ? cols[0].X : b.x0 + 10;
    for (const c of cols) {
      if (c.t >= q - 1e-9) {
        if (c.t <= prevT + 1e-9) return { x: c.X + 4, sys: b.sys, bar: b.i };
        const f = (q - prevT) / (c.t - prevT);
        return { x: prevX + 4 + f * (c.X - prevX), sys: b.sys, bar: b.i };
      }
      prevT = c.t;
      prevX = c.X;
    }
    const f = b.end > prevT ? (q - prevT) / (b.end - prevT) : 0;
    return { x: prevX + 4 + Math.min(1, f) * (b.x1 - 8 - prevX), sys: b.sys, bar: b.i };
  };
  let cursor = null;
  api.setCursor = (q) => {
    const p = api.at(q),
      sys = systems[p.sys];
    if (!cursor) cursor = node("rect", { class: "cursor", width: 3, rx: 1.5 }, back);
    cursor.setAttribute("x", r(p.x - 1.5));
    cursor.setAttribute("y", r(sys.y0 + S));
    cursor.setAttribute("height", r(sys.h - 2 * S - (o.labels ? 18 : 0)));
    return p;
  };
  api.clearCursor = () => {
    if (cursor) cursor.remove();
    cursor = null;
  };
  return api;
}

function digits(g, s, x, y) {
  let w = 0;
  for (const ch of s) w += GW["ts" + ch] * K;
  let cx = x + (28 - w) / 2;
  for (const ch of s) {
    glyph(GLYPH["ts" + ch], cx, y, g, "ts");
    cx += GW["ts" + ch] * K;
  }
}

const yOf = (clef, dn, top) => top + 4 * S - ((dn - BOTTOM[clef]) * S) / 2;

/** Draw one voice's events inside a bar: heads, stems, flags or beams, rests, dots, ties. */
function drawVoice(g, v, evs, bar, clef, top, api) {
  const mid = top + 2 * S;
  const items = [];
  for (const e of evs) {
    const col = bar.cols.find((c) => c.evs.includes(e));
    const eg = node("g", { class: "ev" + (e.cls ? " " + e.cls : "") + (v.partner ? " partner" : "") }, g);
    e._el = eg;
    api.events.push(e);
    const x = col.X;
    if (e.rest) {
      drawRest(eg, e.d, x, clef === "p" ? mid : mid, top);
      items.push({ e, x, rest: true });
      continue;
    }
    const kind = headKind(e.d),
      hw = HEAD[kind];
    const notes = e.notes.slice().sort((a, b) => a.dn - b.dn);
    const ys = notes.map((n) => (clef === "p" ? mid : yOf(clef, n.dn, top)));
    const pos = notes.map((n) => (clef === "p" ? 4 : n.dn - BOTTOM[clef]));
    let up = v.stem ? v.stem === "up" : e.stem ? e.stem === "up" : (pos[0] + pos[pos.length - 1]) / 2 < 4;
    if (clef === "p") up = true;
    e._up = up;
    // seconds: displace the second note of a step to the other side of the stem
    const dx = notes.map(() => 0);
    if (up || kind === "w") {
      for (let i = 1; i < notes.length; i++) if (notes[i].dn - notes[i - 1].dn === 1 && !dx[i - 1]) dx[i] = hw - 1;
    } else {
      for (let i = notes.length - 2; i >= 0; i--) if (notes[i + 1].dn - notes[i].dn === 1 && !dx[i + 1]) dx[i] = -(hw - 1);
    }
    // ledger lines
    if (clef !== "p") {
      const led = node("g", { class: "ledger" }, eg);
      const lo = Math.min(...pos),
        hi = Math.max(...pos),
        x1 = x - 5 + Math.min(0, ...dx),
        x2 = x + hw + 5 + Math.max(0, ...dx);
      for (let p = -2; p >= lo; p -= 2) node("line", { x1: r(x1), x2: r(x2), y1: r(top + 4 * S - (p * S) / 2), y2: r(top + 4 * S - (p * S) / 2) }, led);
      for (let p = 10; p <= hi; p += 2) node("line", { x1: r(x1), x2: r(x2), y1: r(top + 4 * S - (p * S) / 2), y2: r(top + 4 * S - (p * S) / 2) }, led);
    }
    // accidentals, staggered when several
    let accCol = 0;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (!n._show) continue;
      const a = n.acc || 0,
        gl = a > 0 ? GLYPH.sharp : a < 0 ? GLYPH.flat : GLYPH.natural;
      glyph(gl, x - ACC_W - 1 + Math.min(0, dx[i]) - accCol * ACC_W, ys[i], eg, "acc" + (n.cls ? " " + n.cls : ""));
      accCol = accCol ? 0 : 1;
    }
    // heads
    const hg = kind === "w" ? GLYPH.wholeNote : kind === "h" ? GLYPH.halfNote : GLYPH.blackNote;
    notes.forEach((n, i) => {
      const h = glyph(hg, x + dx[i], ys[i], eg, "head" + (n.cls ? " " + n.cls : ""));
      n._el = h;
      if (dotted(e.d)) {
        const onLine = clef !== "p" && pos[i] % 2 === 0;
        node("circle", { class: "dot", cx: r(x + hw + 5 + Math.max(0, ...dx)), cy: r(ys[i] - (onLine ? S / 2 : 0)), r: 2 }, eg);
      }
    });
    const item = { e, x, hw, up, yLow: Math.max(...ys), yHigh: Math.min(...ys), eg, kind };
    items.push(item);
    if (e.label) {
      const tx = node("text", { x: r(x + hw / 2), y: r(Math.min(top - 1.2 * S, Math.min(...ys) - (item.up ? STEM : 0) - 1.4 * S)), "text-anchor": "middle", class: "nlabel" }, eg);
      tx.textContent = e.label;
    }
  }

  // stems, flags and beams
  const groups = [];
  let cur = null;
  for (const it of items) {
    const b = !it.rest && it.kind === "q" ? beams(it.e.d) : 0;
    const beat = Math.floor(it.e._t + 1e-9);
    if (b && cur && cur.beat === beat && Math.abs(cur.last + prevD(cur) - it.e._t) < 1e-6) cur.items.push(it);
    else if (b) {
      cur = { beat, items: [it], last: it.e._t };
      groups.push(cur);
    } else cur = null;
    if (cur) cur.last = it.e._t;
  }
  function prevD(grp) {
    return grp.items[grp.items.length - 1].e.d;
  }
  const beamed = new Set();
  for (const grp of groups) {
    if (grp.items.length < 2) continue;
    const up = v.stem ? v.stem === "up" : grp.items.reduce((s, it) => s + (it.up ? 1 : -1), 0) >= 0;
    const yb = up ? Math.min(...grp.items.map((it) => it.yHigh - STEM)) : Math.max(...grp.items.map((it) => it.yLow + STEM));
    const sx = (it) => (up ? it.x + it.hw - 0.8 : it.x + 0.8);
    for (const it of grp.items) {
      beamed.add(it);
      node("line", { class: "stem", x1: r(sx(it)), x2: r(sx(it)), y1: r(up ? it.yLow - 2 : it.yHigh + 2), y2: r(yb) }, it.eg);
    }
    const bg = node("g", { class: "beam" }, g);
    const th = 0.5 * S,
      step = 0.75 * S * (up ? 1 : -1);
    const ya = up ? yb : yb - th;
    node("rect", { x: r(sx(grp.items[0]) - 0.8), y: r(ya), width: r(sx(grp.items[grp.items.length - 1]) - sx(grp.items[0]) + 1.6), height: th }, bg);
    // second beam for semiquavers: full between neighbours, a stub otherwise
    grp.items.forEach((it, i) => {
      if (beams(it.e.d) < 2) return;
      const nx = grp.items[i + 1],
        pv = grp.items[i - 1];
      if (nx && beams(nx.e.d) >= 2) node("rect", { x: r(sx(it) - 0.8), y: r(ya + step), width: r(sx(nx) - sx(it) + 1.6), height: th }, bg);
      else if (!(pv && beams(pv.e.d) >= 2)) {
        const toward = nx ? 1 : -1,
          len = 9;
        const xa = toward > 0 ? sx(it) - 0.8 : sx(it) - len;
        node("rect", { x: r(xa), y: r(ya + step), width: len + 0.8, height: th }, bg);
      }
    });
  }
  for (const it of items) {
    if (it.rest || beamed.has(it) || it.kind === "w") continue;
    const sx = it.up ? it.x + it.hw - 0.8 : it.x + 0.8,
      y1 = it.up ? it.yLow - 2 : it.yHigh + 2,
      y2 = it.up ? it.yHigh - STEM : it.yLow + STEM;
    node("line", { class: "stem", x1: r(sx), x2: r(sx), y1: r(y1), y2: r(y2) }, it.eg);
    const b = beams(it.e.d);
    if (b) {
      const fl = it.up ? (b === 2 ? GLYPH.flag16Up : GLYPH.flag8Up) : b === 2 ? GLYPH.flag16Down : GLYPH.flag8Down;
      glyph(fl, sx - 0.8, y2, it.eg, "flag");
    }
  }
  // ties to the next event of the voice
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i],
      b = items[i + 1];
    if (!a.e.tie || a.rest || b.rest) continue;
    const yA = a.up ? a.yLow + 0.7 * S : a.yHigh - 0.7 * S,
      bend = a.up ? 0.9 * S : -0.9 * S;
    const xa = a.x + a.hw + 1,
      xb = b.x - 1;
    node("path", { class: "tie", d: "M" + r(xa) + " " + r(yA) + " Q" + r((xa + xb) / 2) + " " + r(yA + bend * 1.6) + " " + r(xb) + " " + r(yA) + " Q" + r((xa + xb) / 2) + " " + r(yA + bend) + " " + r(xa) + " " + r(yA) + "Z" }, a.eg);
  }
}

function drawRest(g, d, x, mid, top) {
  if (d >= 4) glyph(GLYPH.restWhole, x, top + S, g, "rest");
  else if (d >= 2) {
    glyph(GLYPH.restHalf, x, mid, g, "rest");
    if (d === 3) node("circle", { class: "dot", cx: x + 22, cy: mid - S / 2, r: 2 }, g);
  } else if (d >= 1) {
    glyph(GLYPH.restQuarter, x, mid, g, "rest");
    if (d === 1.5) node("circle", { class: "dot", cx: x + 20, cy: mid - S / 2, r: 2 }, g);
  } else if (d >= 0.5) glyph(GLYPH.rest8, x, mid, g, "rest");
  else glyph(GLYPH.rest16, x, mid, g, "rest");
}

/** Dimensions useful to callers (e.g. to size containers). */
export const SCORE_S = S;
