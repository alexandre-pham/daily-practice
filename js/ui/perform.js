// Timed exercises ("perform"): the music runs at a fixed tempo and never waits.
//
// A piece is {sc (score), time, beats, bars, tempo, expected: [{t (quarters), zone, ev, item}]}.
// After a count-in bar of clicks, a cursor moves through the score in step with the metronome.
// Every key press (MIDI piano, the on-screen pad, or the keyboard) is placed on the same clock
// as the clicks (see js/sound.js), corrected by the measured latency, and matched with the
// nearest expected attack within a window (±150 ms by default): within ±80 ms it is "in time",
// else early or late. The tolerance can be made stricter or more relaxed in the settings.
import { $, el } from "../util.js";
import { on } from "../bus.js";
import { t } from "../i18n.js";
import { registerRunner, shell, fitWidth, fitScale, midiMode, midiHint, button, showResult, openPanel, closePanel } from "./exrun.js";
import { score } from "./score.js";
import { audio, click, hush, audioAt, heardNow } from "../sound.js";
import { recordSkill, addRound, latency, setLatency, setTempo, tolMs, calibrated } from "../exercises.js";
import { read } from "../reading.js";
import { MIDI_OK, ensureMidi } from "../recorder.js";

const LEAD_S = 0.3; // time between pressing "ready" and the first click
let GOOD_MS = 80,
  WINDOW_MS = 150;

let P = null; // the running timed exercise

registerRunner("perform", (ex, opts) => {
  [GOOD_MS, WINDOW_MS] = tolMs();
  P = {
    ex,
    opts,
    level: opts.level,
    total: opts.budget ? Infinity : opts.prefs.len || 4,
    i: 0,
    ok: 0,
    hits: 0,
    attacks: 0,
    devs: [],
    started: performance.now(),
    phase: "idle",
    raf: 0,
  };
  P.ui = shell(t("ex_" + ex.id) + " · " + t("levelN", P.level), stopPerform);
  nextPiece();
});

function stopPerform() {
  if (!P) return closePanel();
  cancelAnimationFrame(P.raf);
  hush();
  finishRound(true);
}

function progress() {
  const u = P.ui;
  if (P.total === Infinity) {
    const used = performance.now() - P.started;
    u.fill.style.width = Math.min(100, (used / P.opts.budget) * 100) + "%";
    u.prog.textContent = "";
  } else {
    u.fill.style.width = (P.i / P.total) * 100 + "%";
    u.prog.textContent = t("progress", P.i, P.total);
  }
}

function nextPiece(again) {
  if (!again) P.piece = P.ex.piece(P.level, P.opts.prefs);
  const pc = P.piece;
  pc.expected.forEach((a) => {
    a.dev = undefined;
    a.missed = false;
    a.ev.label = undefined;
    a.ev.cls = "";
  });
  P.extras = 0;
  P.phase = "idle";
  draw();
  progress();
  const u = P.ui;
  u.prompt.textContent = t("perf_ready", pc.tempo);
  u.prompt.classList.remove("hide");
  u.fb.className = "read-fb";
  u.fb.textContent = "\u00a0";
  pads();
  u.actions.textContent = "";
  const go = button(t("perf_go"), "btn perf-go", ready);
  u.actions.appendChild(go);
  go.focus();
  u.hint.textContent = inputHint();
  fitStage();
}

function draw() {
  const pc = P.piece,
    u = P.ui;
  u.staff.textContent = "";
  const wrap = el("div", "ex-score");
  u.staff.appendChild(wrap);
  const rows = pc.sc.staves.length;
  const w = fitWidth(u.staff, rows, 900);
  P.api = score(pc.sc, Object.assign({ width: w, label: t("perf_aria") }, pc.scOpts || {}));
  wrap.style.maxWidth = Math.round(w * fitScale(rows)) + "px";
  wrap.appendChild(P.api.svg);
  P.wrap = wrap;
}

/** Several lines of music on a small screen: shrink the score until it fits the stage. */
function fitStage() {
  if (!P || !P.wrap) return;
  const u = P.ui,
    wrap = P.wrap,
    room = u.stage.clientHeight - 8,
    h = wrap.getBoundingClientRect().height;
  if (room > 80 && h > room) wrap.style.maxWidth = Math.floor(wrap.getBoundingClientRect().width * (room / h)) + "px";
}

function inputHint() {
  const two = P.piece.twoHands;
  const cal = calibrated() ? "" : " " + t("perf_notCal");
  if (midiMode()) return midiHint() + " " + t(two ? "perf_midi2" : "perf_midi1") + cal;
  return t(two ? "perf_keys2" : "perf_keys1") + cal;
}

/** Big tap areas for playing without a piano (and for touch screens). */
function pads() {
  const u = P.ui;
  u.area.textContent = "";
  const row = el("div", "pads");
  const pad = (zone, label) => {
    const b = el("button", "pad", label);
    b.type = "button";
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      tap(zone, e.timeStamp || performance.now());
      b.classList.remove("hit");
      void b.offsetWidth;
      b.classList.add("hit");
    });
    row.appendChild(b);
  };
  if (P.piece.twoHands) {
    pad("lo", t("handL") + " · F");
    pad("hi", t("handR") + " · J");
  } else pad("any", t("perf_pad"));
  u.area.appendChild(row);
}

function ready() {
  const ctx = audio();
  if (!ctx) {
    P.ui.fb.textContent = t("noAudio");
    return;
  }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const pc = P.piece,
    beat = 60 / pc.tempo,
    countIn = pc.beats,
    totalBeats = pc.beats * pc.bars;
  P.beat = beat;
  P.T0 = ctx.currentTime + LEAD_S;
  P.Tp = P.T0 + countIn * beat;
  P.end = totalBeats;
  for (let i = 0; i < countIn + totalBeats; i++) click(P.T0 + i * beat, i % pc.beats === 0, i < countIn ? 1 : 0.7);
  P.phase = "count";
  P.ui.actions.textContent = "";
  P.ui.prompt.textContent = "";
  loop();
}

/** Position in the piece, in quarter notes, of an audio time. */
const qAt = (a) => (a - P.Tp) / P.beat;

function loop() {
  if (!P || (P.phase !== "count" && P.phase !== "play")) return;
  const now = heardNow(),
    q = qAt(now);
  if (q < 0) {
    const n = Math.floor((now - P.T0) / P.beat) + 1;
    P.ui.prompt.textContent = n >= 1 ? String(n) : "";
  } else {
    if (P.phase === "count") {
      P.phase = "play";
      P.ui.prompt.textContent = "";
    }
    P.api.setCursor(Math.min(q, P.end - 0.01));
    // attacks whose time has passed without a tap are missed
    for (const a of P.piece.expected)
      if (a.dev === undefined && !a.missed && (q - a.t) * P.beat * 1000 > WINDOW_MS) {
        a.missed = true;
        mark(a.ev, "is-bad");
      }
  }
  if (q > P.end + 0.4) return finishPiece();
  P.raf = requestAnimationFrame(loop);
}

function mark(ev, cls) {
  if (!ev._el) return;
  ev._el.classList.remove("is-ok", "is-bad", "is-hint");
  ev._el.classList.add(cls);
}

/** A key press at a performance.now() time, in a zone: "any", "hi" (right hand) or "lo". */
function tap(zone, perfMs) {
  if (cal) return calTap(perfMs);
  if (!P || (P.phase !== "count" && P.phase !== "play")) return;
  const q = qAt(audioAt(perfMs) - latency() / 1000);
  if (q < -0.5) return; // tapping along with the count-in
  let best = null,
    bestD = Infinity;
  for (const a of P.piece.expected) {
    if (a.dev !== undefined || a.missed) continue;
    if (a.zone !== "any" && zone !== "any" && a.zone !== zone) continue;
    const d = (q - a.t) * P.beat * 1000;
    if (Math.abs(d) <= WINDOW_MS && Math.abs(d) < bestD) {
      best = a;
      bestD = Math.abs(d);
      best._d = d;
    }
  }
  if (best) {
    best.dev = best._d;
    mark(best.ev, Math.abs(best.dev) <= GOOD_MS ? "is-ok" : "is-hint");
  } else P.extras++;
}

function finishPiece() {
  cancelAnimationFrame(P.raf);
  P.phase = "done";
  hush();
  P.api.clearCursor();
  const pc = P.piece,
    ex = pc.expected;
  const hit = ex.filter((a) => a.dev !== undefined),
    good = hit.filter((a) => Math.abs(a.dev) <= GOOD_MS);
  const mean = hit.length ? hit.reduce((s, a) => s + Math.abs(a.dev), 0) / hit.length : 0;
  const bias = hit.length ? hit.reduce((s, a) => s + a.dev, 0) / hit.length : 0;
  // statistics per cell (or pair of cells)
  const byItem = {};
  for (const a of ex) (byItem[a.item] = byItem[a.item] || []).push(a);
  for (const k in byItem) {
    const list = byItem[k],
      ok = list.every((a) => a.dev !== undefined),
      dev = list.filter((a) => a.dev !== undefined);
    recordSkill(k, ok, dev.length ? dev.reduce((s, a) => s + Math.abs(a.dev), 0) / dev.length : 0);
  }
  const pieceOk = hit.length === ex.length && P.extras === 0;
  P.i++;
  if (pieceOk) P.ok++;
  P.hits += hit.length;
  P.attacks += ex.length;
  hit.forEach((a) => P.devs.push(Math.abs(a.dev)));
  // show the result on the score: colours and the timing error of each attack that was off
  for (const a of ex) {
    a.ev.cls = a.dev === undefined ? "is-bad" : Math.abs(a.dev) <= GOOD_MS ? "is-ok" : "is-hint";
    a.ev.label = a.dev === undefined ? "✕" : Math.abs(a.dev) > GOOD_MS ? (a.dev > 0 ? "+" : "−") + Math.round(Math.abs(a.dev)) : undefined;
  }
  draw();
  const u = P.ui;
  u.fb.className = "read-fb " + (pieceOk ? "ok" : "bad");
  let msg = t("perf_res", hit.length, ex.length, good.length);
  if (hit.length) msg += " · " + t("perf_mean", Math.round(mean));
  if (Math.abs(bias) > 25 && hit.length >= 3) msg += " · " + t(bias > 0 ? "perf_late" : "perf_early");
  if (P.extras) msg += " · " + t("perf_extra", P.extras);
  u.fb.textContent = msg;
  progress();
  u.area.textContent = "";
  u.actions.textContent = "";
  const done = P.total !== Infinity ? P.i >= P.total : performance.now() - P.started >= P.opts.budget;
  const next = button(done ? t("perf_finish") : t("perf_next"), "btn perf-go", () => (done ? finishRound(false) : nextPiece()));
  u.actions.append(button(t("perf_again"), "btn2", () => nextPiece(true)), next);
  next.focus();
  fitStage();
}

function finishRound(stopped) {
  const r = P;
  if (!r) return;
  P = null;
  const mean = r.devs.length ? Math.round(r.devs.reduce((a, b) => a + b, 0) / r.devs.length) : 0;
  const tempo = r.piece ? r.piece.tempo : 0;
  const s = { ex: r.ex.id, level: r.level, n: r.i, ok: r.ok, stopped, dur: performance.now() - r.started };
  if (r.i > 0) {
    addRound({ ex: r.ex.id, level: r.level, n: r.i, ok: r.ok, ms: mean, tempo });
    // The tempo follows the results: a little faster after a good round, slower after a hard one.
    const acc = r.attacks ? r.hits / r.attacks : 0;
    let next = tempo;
    if (r.ex.tempoKey && !stopped) {
      if (acc >= 0.9 && mean <= r.ex.thr) next = tempo + 4;
      else if (acc < 0.7) next = tempo - 4;
      setTempo(r.ex.tempoKey(r.level), next);
    }
    const box = el("div", "perf-sum");
    box.appendChild(el("p", "", t("perf_sumHits", Math.round(acc * 100)) + " · " + t("perf_mean", mean)));
    if (next !== tempo) box.appendChild(el("p", "muted small", t(next > tempo ? "perf_faster" : "perf_slower", next)));
    s.extra = box;
  }
  showResult(s, r.ex, r.opts);
}

// ---------- input ----------
// Notes from the piano always count here (they only arrive once MIDI access was granted).
on("noteon", (ev) => {
  if (!P && !cal) return;
  const two = P && P.piece && P.piece.twoHands;
  tap(two ? (ev.midi >= 60 ? "hi" : "lo") : "any", ev.time);
});

document.addEventListener("keydown", (e) => {
  if ($("exRun").classList.contains("hide") || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (!P && !cal) return;
  const k = e.key.toLowerCase();
  const playing = (P && (P.phase === "count" || P.phase === "play")) || (cal && cal.phase === "run");
  if (playing) {
    if (k === "escape") return;
    e.preventDefault();
    const two = P && P.piece.twoHands;
    if (two && k === "f") tap("lo", e.timeStamp);
    else if (two && k === "j") tap("hi", e.timeStamp);
    else if (!two && k.length === 1) tap("any", e.timeStamp);
    return;
  }
  if (k === " " && P && P.phase === "idle") {
    e.preventDefault();
    ready();
  }
});

// ---------- latency calibration ----------
let cal = null;

/** Measure the delay between a click heard and a key played: 8 clicks, the median difference. */
export async function startCalibration(onDone) {
  if (read.prefs.midi && MIDI_OK) await ensureMidi();
  openPanel();
  cal = { phase: "idle", taps: [], onDone };
  cal.ui = shell(t("calT"), () => {
    hush();
    cal = null;
    closePanel();
  });
  calScreen();
}

function calScreen(msg) {
  const u = cal.ui;
  u.prompt.textContent = t("calPrompt");
  u.stage.classList.add("hide");
  u.fb.className = "read-fb";
  u.fb.textContent = msg || "\u00a0";
  u.area.textContent = "";
  const row = el("div", "pads");
  const b = el("button", "pad", t("perf_pad"));
  b.type = "button";
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    tap("any", e.timeStamp);
  });
  row.appendChild(b);
  u.area.appendChild(row);
  u.actions.textContent = "";
  const go = button(t("perf_go"), "btn perf-go", calRun);
  u.actions.appendChild(go);
  go.focus();
  u.hint.textContent = t("calHint", latency()) + " " + t(read.prefs.midi && MIDI_OK ? "calPiano" : "calNoPiano");
  u.fill.style.width = "0";
  u.prog.textContent = "";
}

function calRun() {
  const ctx = audio();
  if (!ctx) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const beat = 60 / 90;
  cal.T0 = ctx.currentTime + LEAD_S;
  cal.clicks = [];
  for (let i = 0; i < 12; i++) {
    click(cal.T0 + i * beat, i % 4 === 0);
    if (i >= 4) cal.clicks.push(cal.T0 + i * beat);
  }
  cal.taps = [];
  cal.phase = "run";
  cal.ui.prompt.textContent = t("calGo");
  setTimeout(calEnd, (LEAD_S + 12 * beat + 0.4) * 1000);
}

function calTap(perfMs) {
  if (!cal || cal.phase !== "run") return;
  cal.taps.push(audioAt(perfMs));
}

function calEnd() {
  if (!cal) return;
  cal.phase = "idle";
  const diffs = [];
  for (const a of cal.taps) {
    let best = null;
    for (const c of cal.clicks) if (best === null || Math.abs(a - c) < Math.abs(a - best)) best = c;
    const d = (a - best) * 1000;
    if (Math.abs(d) < 300) diffs.push(d);
  }
  if (diffs.length < 5) return calScreen(t("calFew"));
  diffs.sort((a, b) => a - b);
  const med = diffs[Math.floor(diffs.length / 2)];
  setLatency(med);
  calScreen(t("calDone", Math.round(med)));
  if (cal.onDone) cal.onDone();
}

window.addEventListener("resize", () => {
  if (P && P.phase !== "count" && P.phase !== "play" && P.api) {
    draw();
    fitStage();
  }
});

/** For tests: the running timed exercise and the calibration in progress. */
export const _perfState = () => P;
export const _calState = () => cal;
