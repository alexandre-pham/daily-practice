// Tempo sheet: plays a MIDI recording and shows, as it plays, the tempo of each hand.
import { $, fmtSec } from "../util.js";
import { t } from "../i18n.js";
import { on } from "../bus.js";
import { lockScroll } from "./dialogs.js";
import { parseMidi, splitHands, estimateTempo, analyze, valueAt } from "../tempo.js";
import { Player } from "../tempo-player.js";

const DEV_WARN = 0.05; // ±5 %: the steady zone drawn around the reference

let cur = null; // {parsed, a, ref, est, player, label}
let raf = 0,
  returnFocus = null,
  dragging = null,
  shown = {};

// ---------- open & close ----------
/** Open the sheet for a MIDI blob or file. `label` names the recording. */
export async function openTempo(blob, label) {
  returnFocus = document.activeElement;
  close(false);
  $("tempoSrc").textContent = label || "";
  $("tempoErr").classList.add("hide");
  $("tempoBody").classList.add("hide");
  $("tempoDlg").classList.remove("hide");
  lockScroll();
  $("tempoClose").focus();
  let parsed;
  try {
    parsed = parseMidi(await blob.arrayBuffer());
  } catch {
    $("tempoErr").textContent = t("tempoBad");
    $("tempoErr").classList.remove("hide");
    return;
  }
  splitHands(parsed.notes);
  const est = estimateTempo(parsed.notes);
  cur = { parsed, est, ref: est, a: null, label, player: new Player(parsed.notes, parsed.duration) };
  cur.player.onEnd = renderControls;
  warmUp(cur.player);
  reanalyze();
  setRate(1);
  $("tempoBody").classList.remove("hide");
  resize();
  renderControls();
  frame();
}

function close(restoreFocus = true) {
  cancelAnimationFrame(raf);
  raf = 0;
  if (cur) cur.player.destroy();
  cur = null;
  shown = {};
  if ($("tempoDlg").classList.contains("hide")) return;
  $("tempoDlg").classList.add("hide");
  lockScroll();
  if (restoreFocus && returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus();
}

function reanalyze() {
  cur.a = analyze(cur.parsed, cur.ref);
  $("tRefVal").textContent = String(cur.ref);
  $("tRefNote").textContent = cur.ref === cur.est ? t("tempoEst") : t("tempoSet", cur.est);
  const L = avg(cur.a.L),
    R = avg(cur.a.R);
  $("tCanvas").setAttribute(
    "aria-label",
    t("tempoAria", fmtSec(cur.parsed.duration), cur.ref, L ? Math.round(L) : "—", R ? Math.round(R) : "—"),
  );
  shown = {};
}
const avg = (s) => {
  const xs = s.filter((v) => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

// ---------- controls ----------
/** Start loading the piano as soon as the sheet opens, so Play usually starts at once. */
function warmUp(p) {
  p.loadP = p.prepare();
  p.loadP.catch(() => {}); // reported when Play is pressed
}

async function togglePlay() {
  if (!cur) return;
  const p = cur.player;
  if (p.playing) p.pause();
  else {
    if (!p.ready) {
      setLoading(true);
      try {
        await (p.loadP || p.prepare()).catch(() => p.prepare()); // retry once if the first load failed
      } catch {
        setLoading(false);
        $("tempoErr").textContent = t("tempoLoadFail");
        $("tempoErr").classList.remove("hide");
        return;
      }
      setLoading(false);
      if (!cur || cur.player !== p) return; // closed meanwhile
    }
    $("tempoErr").classList.add("hide");
    p.play();
  }
  renderControls();
  frame();
}
function setLoading(on) {
  $("tPlay").disabled = on;
  if (on) $("tPlayTxt").textContent = t("tempoLoading");
  else renderControls();
}
function setRate(r) {
  if (!cur) return;
  const nf = new Intl.NumberFormat(t("locale"));
  document.querySelectorAll("#tRate [data-rate]").forEach((b) => (b.textContent = nf.format(Number(b.dataset.rate)) + "×"));
  cur.player.setRate(r);
  document.querySelectorAll("#tRate [data-rate]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rate) === r)));
}
function setRef(v) {
  if (!cur) return;
  cur.ref = Math.max(30, Math.min(300, Math.round(v)));
  reanalyze();
  draw();
}
function renderControls() {
  if (!cur) return;
  const p = cur.player.playing;
  $("tPlay").setAttribute("aria-pressed", String(p));
  $("tPlayTxt").textContent = p ? t("tempoPause") : t("tempoPlay");
  $("tPlay").classList.toggle("on", p);
}

// ---------- drawing ----------
function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const PAD = { l: 38, r: 10, t: 10, b: 24 };

function resize() {
  const c = $("tCanvas"),
    box = c.parentElement.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  const h = window.innerWidth >= 960 ? 260 : 210;
  c.style.height = h + "px";
  c.width = Math.round(box.width * dpr);
  c.height = Math.round(h * dpr);
  draw();
}

function draw() {
  if (!cur || !cur.a) return;
  const c = $("tCanvas"),
    g = c.getContext("2d"),
    dpr = window.devicePixelRatio || 1,
    W = c.width / dpr,
    H = c.height / dpr,
    a = cur.a,
    ref = cur.ref,
    now = cur.player.time();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const col = { ink: css("--ink"), muted: css("--muted"), line: css("--line"), key: css("--key"), felt: css("--felt") };

  // Vertical range: ±20 % around the reference, wider if the playing goes further.
  let lo = ref * 0.8,
    hi = ref * 1.2;
  a.both.forEach((v) => {
    if (v == null) return;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  });
  lo = Math.max(lo, ref * 0.55) * 0.98;
  hi = Math.min(hi, ref * 1.45) * 1.02;
  const x0 = PAD.l,
    x1 = W - PAD.r,
    y0 = PAD.t,
    y1 = H - PAD.b;
  const X = (s) => x0 + (s / a.duration) * (x1 - x0),
    Y = (b) => y1 - ((Math.max(lo, Math.min(hi, b)) - lo) / (hi - lo)) * (y1 - y0);

  // Steady zone and reference line.
  g.fillStyle = col.key;
  g.fillRect(x0, Y(ref * (1 + DEV_WARN)), x1 - x0, Y(ref * (1 - DEV_WARN)) - Y(ref * (1 + DEV_WARN)));
  g.font = "11px 'Instrument Sans', system-ui, sans-serif";
  g.textBaseline = "middle";
  g.textAlign = "right";
  g.fillStyle = col.muted;
  [0.9, 1, 1.1].forEach((k) => {
    const v = ref * k;
    if (v < lo || v > hi) return;
    g.strokeStyle = k === 1 ? col.muted : col.line;
    g.setLineDash(k === 1 ? [4, 4] : []);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0, Math.round(Y(v)) + 0.5);
    g.lineTo(x1, Math.round(Y(v)) + 0.5);
    g.stroke();
    g.fillText(String(Math.round(v)), x0 - 6, Y(v));
  });
  g.setLineDash([]);

  // Time axis.
  const every = a.duration > 240 ? 60 : a.duration > 60 ? 30 : 10;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  for (let s = 0; s <= a.duration; s += every) g.fillText(fmtSec(s), Math.min(x1 - 12, Math.max(x0 + 12, X(s))), H - 6);

  // Both hands: the part already heard is solid, the rest is faint.
  const series = (vals, color, width, alpha, from, to) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.globalAlpha = alpha;
    g.lineJoin = "round";
    g.beginPath();
    let pen = false;
    for (let i = Math.max(0, Math.floor(from / a.step)); i < vals.length && i * a.step <= to; i++) {
      const v = vals[i];
      if (v == null) {
        pen = false;
        continue;
      }
      const px = X(i * a.step),
        py = Y(v);
      pen ? g.lineTo(px, py) : g.moveTo(px, py);
      pen = true;
    }
    g.stroke();
    g.globalAlpha = 1;
  };
  [
    [a.L, col.ink, 1.6],
    [a.R, col.felt, 2.4],
  ].forEach(([vals, color, w]) => {
    series(vals, color, w, 0.22, now, a.duration);
    series(vals, color, w, 1, 0, now);
  });

  // Playhead with the current value of each hand.
  const px = Math.round(X(now)) + 0.5;
  g.strokeStyle = col.ink;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(px, y0);
  g.lineTo(px, y1);
  g.stroke();
  [
    [a.L, col.ink],
    [a.R, col.felt],
  ].forEach(([vals, color]) => {
    const v = valueAt(a, vals, now);
    if (v == null) return;
    g.fillStyle = color;
    g.beginPath();
    g.arc(px, Y(v), 4, 0, Math.PI * 2);
    g.fill();
  });
}

function readout(hand, v) {
  const key = hand + (v == null ? "-" : Math.round(v));
  if (shown[hand] === key) return;
  shown[hand] = key;
  const box = $("tHand" + hand);
  $("tv" + hand).textContent = v == null ? "—" : String(Math.round(v));
  const dev = v == null ? null : v / cur.ref - 1,
    d = $("td" + hand);
  if (dev == null) d.textContent = t("tempoNone");
  else {
    const pct = Math.round(dev * 100);
    d.textContent = pct === 0 ? t("tempoOnRef") : t(pct > 0 ? "tempoFaster" : "tempoSlower", Math.abs(pct));
  }
  box.classList.toggle("off", dev != null && Math.abs(dev) > DEV_WARN);
}

function frame() {
  cancelAnimationFrame(raf);
  if (!cur) return;
  const now = cur.player.time();
  draw();
  readout("L", valueAt(cur.a, cur.a.L, now));
  readout("R", valueAt(cur.a, cur.a.R, now));
  $("tClock").textContent = fmtSec(now) + " / " + fmtSec(cur.parsed.duration);
  if (cur.player.playing) raf = requestAnimationFrame(frame);
}

// ---------- seeking on the chart ----------
function timeFromX(clientX) {
  const r = $("tCanvas").getBoundingClientRect();
  const f = (clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r);
  return Math.max(0, Math.min(1, f)) * cur.parsed.duration;
}
function seek(s) {
  if (!cur) return;
  cur.player.seek(s);
  frame();
}

// ---------- wiring ----------
export function initTempo() {
  $("tempoClose").addEventListener("click", () => close());
  $("tempoBg").addEventListener("click", () => close());
  on("closeTempo", () => close());
  $("tPlay").addEventListener("click", togglePlay);
  $("tBack").addEventListener("click", () => cur && seek(cur.player.time() - 5));
  $("tRate").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rate]");
    if (b) setRate(Number(b.dataset.rate));
  });
  $("tRefMinus").addEventListener("click", () => cur && setRef(cur.ref - 1));
  $("tRefPlus").addEventListener("click", () => cur && setRef(cur.ref + 1));
  $("tRefHalf").addEventListener("click", () => cur && setRef(cur.ref / 2));
  $("tRefDouble").addEventListener("click", () => cur && setRef(cur.ref * 2));

  const c = $("tCanvas");
  c.addEventListener("pointerdown", (e) => {
    if (!cur) return;
    dragging = { was: cur.player.playing };
    cur.player.pause();
    c.setPointerCapture(e.pointerId);
    cur.player.seek(timeFromX(e.clientX));
    frame();
  });
  c.addEventListener("pointermove", (e) => {
    if (!dragging || !cur) return;
    cur.player.seek(timeFromX(e.clientX));
    frame();
  });
  const end = () => {
    if (!dragging || !cur) return;
    if (dragging.was) cur.player.play();
    dragging = null;
    renderControls();
    frame();
  };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
  c.addEventListener("keydown", (e) => {
    if (!cur) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      seek(cur.player.time() + (e.key === "ArrowLeft" ? -5 : 5));
    } else if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    }
  });
  window.addEventListener("resize", () => cur && resize());

  // Entry point on the Statistics view: any MIDI file from the device.
  $("tempoOpen").addEventListener("click", () => $("tempoFile").click());
  $("tempoFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) openTempo(f, f.name);
  });
  const drop = $("tempoSec");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openTempo(f, f.name);
  });
}

export const tempoOpen = () => !$("tempoDlg").classList.contains("hide");
