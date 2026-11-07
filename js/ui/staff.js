// Draws a five-line staff with a clef and whole notes as SVG, using DOM calls only
// (the CSP enforces Trusted Types, so no innerHTML).
import { GLYPH, WHOLE_NOTE_WIDTH } from "../glyphs.js";
import { BOTTOM } from "../reading.js";

const NS = "http://www.w3.org/2000/svg";
const S = 14; // staff space, in SVG units
const K = S / 250; // glyph units (250 per staff space) to SVG units
const TOP = 3 * S; // y of the top line; three spaces of room above and below
const BOT = TOP + 4 * S;
const H = BOT + 3 * S;
const NOTE_W = WHOLE_NOTE_WIDTH * K;

function node(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const yOf = (clef, dn) => BOT - ((dn - BOTTOM[clef]) * S) / 2;

function glyph(d, x, y, parent, cls) {
  const attrs = { d, transform: "translate(" + x + " " + y + ") scale(" + K + " " + -K + ")" };
  if (cls) attrs.class = cls;
  return node("path", attrs, parent);
}

function drawNote(g, clef, dn, x, cls) {
  const pos = dn - BOTTOM[clef];
  const ledger = node("g", { class: "ledger" + (cls ? " " + cls : "") }, g);
  for (let p = -2; p >= pos; p -= 2) ledgerLine(ledger, x, BOT + (-p * S) / 2);
  for (let p = 10; p <= pos; p += 2) ledgerLine(ledger, x, BOT - (p * S) / 2);
  glyph(GLYPH.wholeNote, x, yOf(clef, dn), g, "head" + (cls ? " " + cls : ""));
}
function ledgerLine(g, x, y) {
  node("line", { x1: x - 6, x2: x + NOTE_W + 6, y1: y, y2: y }, g);
}

/**
 * Build a staff SVG.
 * @param {"t"|"b"} clef
 * @param {{dn:number, cls?:string}[]} notes drawn left to right
 * @param {{label?:string, gap?:number, width?:number}} opts
 */
export function staff(clef, notes, opts = {}) {
  const gap = opts.gap || 30,
    x0 = 58;
  const width = opts.width || Math.max(160, x0 + notes.length * gap + 14);
  const svg = node("svg", { viewBox: "0 0 " + width + " " + H, class: "staff", role: "img" });
  if (opts.label) svg.setAttribute("aria-label", opts.label);
  const lines = node("g", { class: "lines" }, svg);
  for (let i = 0; i < 5; i++) node("line", { x1: 2, x2: width - 2, y1: TOP + i * S, y2: TOP + i * S }, lines);
  if (clef === "t") glyph(GLYPH.gClef, 8, BOT - S, svg, "clef");
  else glyph(GLYPH.fClef, 8, TOP + S, svg, "clef");
  const g = node("g", { class: "notes" }, svg);
  const start = notes.length === 1 ? (width + x0 - NOTE_W) / 2 : x0 + (gap - NOTE_W) / 2;
  notes.forEach((n, i) => drawNote(g, clef, n.dn, start + i * gap, n.cls));
  return svg;
}
