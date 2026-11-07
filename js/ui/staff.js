// Draws a five-line staff with clefs and whole notes as SVG, using DOM calls only
// (the CSP enforces Trusted Types, so no innerHTML).
import { GLYPH, WHOLE_NOTE_WIDTH } from "../glyphs.js";
import { BOTTOM } from "../reading.js";

const NS = "http://www.w3.org/2000/svg";
const S = 14; // staff space, in SVG units
const K = S / 250; // glyph units (250 per staff space) to SVG units
const TOP = 3 * S; // y of the top line; three spaces of room above and below
const BOT = TOP + 4 * S;
const H = BOT + 3 * S;
const LABEL_H = 18; // extra room under the staff for note names
const NOTE_W = WHOLE_NOTE_WIDTH * K;
const X0 = 58; // first note area, after the opening clef
const CHANGE_W = 28; // room taken by a clef change inside the line
const SMALL = 0.72; // clef changes are drawn smaller, as in printed music

function node(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const yOf = (clef, dn) => BOT - ((dn - BOTTOM[clef]) * S) / 2;

function glyph(d, x, y, parent, cls, scale = 1) {
  const k = K * scale;
  return node("path", { d, class: cls, transform: "translate(" + x + " " + y + ") scale(" + k + " " + -k + ")" }, parent);
}
function clefGlyph(clef, x, parent, scale) {
  if (clef === "t") glyph(GLYPH.gClef, x, BOT - S, parent, "clef", scale);
  else glyph(GLYPH.fClef, x, TOP + S, parent, "clef", scale);
}

function drawNote(g, clef, dn, x, cls) {
  const pos = dn - BOTTOM[clef];
  const ledger = node("g", { class: "ledger" }, g);
  for (let p = -2; p >= pos; p -= 2) ledgerLine(ledger, x, BOT - (p * S) / 2);
  for (let p = 10; p <= pos; p += 2) ledgerLine(ledger, x, BOT - (p * S) / 2);
  glyph(GLYPH.wholeNote, x, yOf(clef, dn), g, "head" + (cls ? " " + cls : ""));
}
function ledgerLine(g, x, y) {
  node("line", { x1: x - 6, x2: x + NOTE_W + 6, y1: y, y2: y }, g);
}

/**
 * Build a staff SVG. Each note may carry its own clef; a change of clef inside the line is
 * drawn as a smaller clef before the note.
 * @param {"t"|"b"} clef opening clef
 * @param {{dn:number, clef?:"t"|"b", cls?:string, current?:boolean, label?:string}[]} notes
 * @param {{label?:string, gap?:number, width?:number, labelRow?:boolean}} opts
 */
export function staff(clef, notes, opts = {}) {
  const gap = opts.gap || 30,
    labels = opts.labelRow || notes.some((n) => n.label);
  // Lay out first, so the width is known before drawing.
  let x = X0,
    cur = clef;
  const placed = notes.map((n) => {
    const c = n.clef || clef,
      change = c !== cur;
    if (change) x += CHANGE_W;
    const p = { n, clef: c, change, x: x + (gap - NOTE_W) / 2, cx: x - CHANGE_W + 2 };
    cur = c;
    x += gap;
    return p;
  });
  const natural = x + 12,
    width = Math.max(opts.width || 0, natural, 160),
    h = H + (labels ? LABEL_H : 0);
  // A single note sits in the middle of the free space.
  if (notes.length === 1 && !placed[0].change) placed[0].x = (width + X0 - NOTE_W) / 2;

  const svg = node("svg", { viewBox: "0 0 " + width + " " + h, class: "staff", role: "img" });
  if (opts.label) svg.setAttribute("aria-label", opts.label);
  const back = node("g", {}, svg);
  const lines = node("g", { class: "lines" }, svg);
  for (let i = 0; i < 5; i++) node("line", { x1: 2, x2: width - 2, y1: TOP + i * S, y2: TOP + i * S }, lines);
  clefGlyph(clef, 8, svg, 1);
  const g = node("g", { class: "notes" }, svg);
  for (const p of placed) {
    if (p.change) clefGlyph(p.clef, p.cx, g, SMALL);
    if (p.n.current) node("rect", { class: "cursor", x: p.x - 8, y: TOP - 2.5 * S, width: NOTE_W + 16, height: 9 * S, rx: 7 }, back);
    drawNote(g, p.clef, p.n.dn, p.x, p.n.cls);
    if (p.n.label) {
      const tx = node("text", { x: p.x + NOTE_W / 2, y: h - 5, "text-anchor": "middle", class: "nlabel" + (p.n.cls ? " " + p.n.cls : "") }, svg);
      tx.textContent = p.n.label;
    }
  }
  return svg;
}
