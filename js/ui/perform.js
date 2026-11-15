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
import { registerRunner, shell, fitWidth, fitScale, fitToStage, midiMode, midiHint, button, showResult, openPanel, closePanel } from "./exrun.js";
import { score } from "./score.js";
import { audio, click, note, hush, audioAt, heardNow, piano, hasPiano } from "../sound.js";
import { recordSkill, addRound, latency, setLatency, setTempo, tolMs, calibrated, pitchLabel } from "../exercises.js";
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
    cont: [],
    notes: [],
    timing: [],
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
    if (a.note) a.note.cls = "";
  });
  P.extras = 0;
  P.phase = "idle";
  P.demo = !!pc.pitched && !midiMode();
  draw();
  progress();
  const u = P.ui;
  u.prompt.textContent = pc.pitched ? pc.keyName + " · " + pc.time.join("/") + " · ♩ = " + pc.tempo : t("perf_ready", pc.tempo);
  u.prompt.classList.remove("hide");
  u.fb.className = "read-fb";
  u.fb.textContent = "\u00a0";
  if (pc.pitched) study();
  else pads();
  u.actions.textContent = "";
  if (P.ex.tempoKey) u.actions.appendChild(tempoControl());
  const go = button(P.demo ? t("perf_demo") : t("perf_go"), "btn perf-go", ready);
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
  // Pieces are drawn a little smaller, so four bars fit on one line where the screen allows.
  const size = pc.pitched ? rows + 0.5 : rows;
  let w = fitWidth(u.staff, size, pc.pitched ? 1500 : 900);
  // On a phone, two bars per line rather than one: smaller notes, but phrases stay readable.
  if (pc.pitched && window.innerWidth < 700) w = Math.max(w, 600);
  P.api = score(pc.sc, Object.assign({ width: w, label: t("perf_aria") }, pc.scOpts || {}));
  wrap.appendChild(P.api.svg);
  P.wrap = wrap;
}

/** The score as large as the stage allows (see fitToStage). */
function fitStage() {
  if (!P || !P.wrap) return;
  fitToStage(P.ui.stage, [P.wrap]);
}

function inputHint() {
  if (P.piece.pitched) return (P.demo ? t("perf_demoH") : midiHint() + (calibrated() ? "" : " " + t("perf_notCal"))) + " " + t("perf_tempoKeys");
  const two = P.piece.twoHands;
  const cal = calibrated() ? "" : " " + t("perf_notCal");
  if (midiMode()) return midiHint() + " " + t(two ? "perf_midi2" : "perf_midi1") + cal;
  return t(two ? "perf_keys2" : "perf_keys1") + cal;
}

/**
 * Before a piece: time to study it. A short checklist of what to look for, and a countdown;
 * "Ready" can be pressed at any time.
 */
function study() {
  const u = P.ui,
    pc = P.piece;
  u.area.textContent = "";
  const box = el("div", "study");
  // The questions, each with its answer hidden until "Show the answers" is pressed. On small
  // screens, a one-line reminder; the answers appear below it.
  const ans = studyAnswers(pc);
  const wide = window.innerWidth >= 700 && window.innerHeight >= 700;
  const ul = el("ul", "studylist");
  const hidden = [];
  ["study_key", "study_time", "study_hands", "study_shapes", "study_repeat", "study_partner"].forEach((k, i) => {
    if (!ans[i]) return;
    const li = el("li");
    if (wide) li.appendChild(el("span", "", t(k)));
    const a = el("span", "study-ans hide", ans[i]);
    hidden.push(a);
    li.appendChild(a);
    ul.appendChild(li);
  });
  if (!wide) {
    box.appendChild(el("p", "study-short", t("study_short")));
    ul.classList.add("hide");
  }
  box.appendChild(ul);
  const show = button(t("study_show"), "linkbtn study-toggle", () => {
    const open = show.getAttribute("aria-expanded") !== "true";
    show.setAttribute("aria-expanded", String(open));
    show.textContent = t(open ? "study_hide" : "study_show");
    hidden.forEach((a) => a.classList.toggle("hide", !open));
    if (!wide) ul.classList.toggle("hide", !open);
    fitStage();
  });
  show.setAttribute("aria-expanded", "false");
  box.appendChild(show);
  const left = el("p", "muted small study-left");
  box.appendChild(left);
  u.area.appendChild(box);
  let n = pc.study;
  clearInterval(P.studyTimer);
  const tick = () => {
    left.textContent = n > 0 ? t("study_left", n) : t("study_ready");
    if (n-- <= 0) clearInterval(P.studyTimer);
  };
  tick();
  P.studyTimer = setInterval(tick, 1000);
  if (pc.partnerNotes.length || P.demo) piano(); // load the samples while the player studies
}

/** Answers to the five study questions for a generated piece. */
function studyAnswers(pc) {
  const a = pc.answers;
  if (!a) return [];
  // chords per bar, with the progression in degrees
  const out = [
    t("ans_key", a.key.name, a.key.sig, a.key.sharp),
    t("ans_time", a.beats),
    a.rh || a.lh ? t("ans_hands", a.rh, a.lh) : "",
    t("ans_chords", a.chords.join(" | "), a.romans.join(" – ")) + (a.lhKind ? " " + t("ans_lh_" + a.lhKind) : ""),
    t(a.bars >= 8 ? "ans_repeat8" : "ans_repeat4"),
    a.partner ? t("ans_partner_" + a.partner) + (a.style ? " " + t("ans_style", t("style_" + a.style)) : "") : "",
  ];
  return out;
}

/** Slower / faster before playing; the tempo is kept for the level. */
function tempoControl() {
  const box = el("div", "tempoctl"),
    val = el("span", "tempo-val");
  const running = () => P.phase === "count" || P.phase === "play";
  const show = () => {
    val.textContent = "♩ = " + P.piece.tempo;
    const pc = P.piece;
    if (!running() && P.phase !== "done") P.ui.prompt.textContent = pc.pitched ? pc.keyName + " · " + pc.time.join("/") + " · ♩ = " + pc.tempo : t("perf_ready", pc.tempo);
  };
  const step = (dv) => () => {
    const v = Math.max(30, Math.min(200, P.piece.tempo + dv));
    P.piece.tempo = v;
    setTempo(P.ex.tempoKey(P.level), v);
    if (running()) liveTempo(v);
    show();
  };
  box.dataset.tempo = "1";
  const minus = button("−", "iconbtn round", step(-4)),
    plus = button("+", "iconbtn round", step(4));
  for (const b of [minus, plus]) b.addEventListener("mousedown", (e) => running() && e.preventDefault());
  P.tempoStep = step;
  minus.setAttribute("aria-label", t("slower"));
  plus.setAttribute("aria-label", t("faster"));
  box.append(minus, val, plus);
  show();
  return box;
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

async function ready() {
  const ctx = audio();
  if (!ctx) {
    P.ui.fb.textContent = t("noAudio");
    return;
  }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearInterval(P.studyTimer);
  const pc0 = P.piece;
  if ((pc0.partnerNotes && pc0.partnerNotes.length) || P.demo) {
    if (!hasPiano()) {
      P.ui.prompt.textContent = t("perf_loading");
      P.ui.actions.textContent = "";
      await piano();
      if (!P || P.piece !== pc0) return;
    }
  }
  const pc = P.piece,
    beat = 60 / pc.tempo,
    countIn = pc.beats,
    totalBeats = pc.beats * pc.bars;
  P.beat = beat;
  P.countIn = countIn;
  P.T0 = ctx.currentTime + LEAD_S;
  P.Tp = P.T0 + countIn * beat;
  P.end = totalBeats;
  schedule(0);
  P.phase = "count";
  P.ui.actions.textContent = "";
  // the tempo can still be changed while playing
  if (P.ex.tempoKey) P.ui.actions.appendChild(tempoControl());
  P.ui.prompt.textContent = "";
  loop();
}

/** Schedule the clicks and the partner's notes that fall after an audio time. */
function schedule(after) {
  const pc = P.piece,
    beat = P.beat,
    clicksAll = pc.clicks !== false;
  for (let i = 0; i < P.countIn + P.end; i++) {
    const at = P.T0 + i * beat;
    if (at > after && (i < P.countIn || clicksAll)) click(at, i % pc.beats === 0, i < P.countIn ? 1 : pc.pitched ? 0.35 : 0.7);
  }
  // the partner part (and, without a piano, the whole piece as a demonstration)
  const sound = (pc.partnerNotes || []).concat(P.demo ? pc.expected.map((a) => ({ t: a.t, d: a.ev.d, p: a.midi })) : []);
  for (const n of sound) {
    const at = P.Tp + n.t * beat;
    if (at > after) note(n.p, at, n.d * beat * 0.95, P.demo ? 78 : 64);
  }
}

/**
 * Change the tempo while the music runs: the cursor stays where it is, what follows is played
 * at the new speed (the clicks and partner notes already scheduled are replaced).
 */
function liveTempo(bpm) {
  const now = heardNow(),
    q = qAt(now),
    beat = 60 / bpm;
  hush();
  P.beat = beat;
  P.Tp = now - q * beat;
  P.T0 = P.Tp - P.countIn * beat;
  schedule(now + 0.03);
}

/**
 * How early or late (ms) a note may come and still count. Reading real notes takes longer than
 * tapping, so in pieces a right note counts up to a quarter of a beat early and half a beat late
 * (shown as early or late); in rhythm exercises the tolerance setting decides.
 */
function windows() {
  if (!P.piece.pitched) return [WINDOW_MS, WINDOW_MS];
  const beatMs = P.beat * 1000;
  return [Math.max(WINDOW_MS, Math.min(300, beatMs * 0.25)), Math.max(WINDOW_MS, Math.min(600, beatMs * 0.5))];
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
    // look-ahead: a bar disappears once the cursor is in it (or past its middle)
    const pc = P.piece;
    if (pc.fade) {
      const barLen = (pc.time[0] * 4) / pc.time[1];
      P.api.barGroups.forEach((g, i) => {
        if (g && q >= i * barLen + (pc.fade === 1 ? barLen / 2 : 0)) g.classList.add("gone");
      });
    }
    // attacks whose time has passed without a tap are missed
    if (!P.demo)
      for (const a of pc.expected)
        if (a.dev === undefined && !a.missed && (q - a.t) * P.beat * 1000 > windows()[1]) {
          a.missed = true;
          mark(a.note && a.note._el ? { _el: a.note._el } : a.ev, "is-bad");
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

/**
 * A key press at a performance.now() time, in a zone: "any", "hi" (right hand) or "lo". In a
 * piece, the pitch must be right too: a wrong note counts as an extra one.
 */
function tap(zone, perfMs, midi) {
  if (cal) return calTap(perfMs);
  if (!P || (P.phase !== "count" && P.phase !== "play") || P.demo) return;
  if (P.piece.pitched && midi === undefined) return;
  const q = qAt(audioAt(perfMs) - latency() / 1000);
  if (q < -0.5) return; // tapping along with the count-in
  // Candidates: unplayed notes of the right pitch (and hand) within the window. A note in time
  // wins; otherwise the earliest one, since a late note belongs to the beat that has passed.
  const [early, late] = windows();
  let best = null;
  for (const a of P.piece.expected) {
    if (a.dev !== undefined || a.missed) continue;
    if (a.zone !== "any" && zone !== "any" && a.zone !== zone) continue;
    if (a.midi !== undefined && a.midi !== midi) continue;
    const d = (q - a.t) * P.beat * 1000;
    if (d < -early || d > late) continue;
    const inTime = Math.abs(d) <= GOOD_MS,
      bestIn = best && Math.abs(best._d) <= GOOD_MS;
    if (!best || (inTime && (!bestIn || Math.abs(d) < Math.abs(best._d))) || (!inTime && !bestIn && a.t < best.t)) {
      best = a;
      best._d = d;
    }
  }
  if (best) {
    best.dev = best._d;
    mark(best.note && best.note._el ? { _el: best.note._el } : best.ev, Math.abs(best.dev) <= GOOD_MS ? "is-ok" : "is-hint");
  } else P.extras++;
  if (P.piece.pitched) heard(midi, best);
}

/** What the app heard, live under the score: the note, and how early or late it was. */
function heard(midi, a) {
  const u = P.ui,
    name = pitchLabel(spell(midi, P.piece.sc.key || 0));
  if (a) {
    const ms = Math.round(a.dev);
    u.fb.className = "read-fb heard " + (Math.abs(ms) <= GOOD_MS ? "ok" : "late");
    u.fb.textContent = name + " · " + (Math.abs(ms) <= GOOD_MS ? t("heard_inTime") : (ms > 0 ? "+" : "−") + Math.abs(ms) + " ms");
  } else {
    u.fb.className = "read-fb heard bad";
    u.fb.textContent = name + " · " + t("heard_notExpected");
  }
}

/** A MIDI pitch spelled for a key: sharps in sharp keys, flats in flat keys. */
function spell(m, key) {
  const pc = ((m % 12) + 12) % 12,
    oct = Math.floor(m / 12) - 1,
    W = [0, 2, 4, 5, 7, 9, 11];
  const w = W.indexOf(pc);
  if (w >= 0) return { dn: oct * 7 + w, acc: 0 };
  if (key < 0) return { dn: oct * 7 + W.indexOf(pc + 1), acc: -1 };
  return { dn: oct * 7 + W.indexOf(pc - 1), acc: 1 };
}

function finishPiece() {
  cancelAnimationFrame(P.raf);
  P.phase = "done";
  hush();
  P.api.clearCursor();
  if (P.piece.pitched) return finishPitched();
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
  if (P.ex.tempoKey) u.actions.prepend(tempoControl());
  next.focus();
  fitStage();
}

/**
 * The end of a piece: right notes, notes in time, and continuity, the share of beats where
 * something right was played. Continuity comes first: not stopping is the habit trained here.
 */
function finishPitched() {
  const pc = P.piece,
    ex = pc.expected,
    u = P.ui;
  if (P.demo) {
    draw();
    u.fb.className = "read-fb";
    u.fb.textContent = t("perf_demoDone");
    return afterPiece(false);
  }
  const hit = ex.filter((a) => a.dev !== undefined),
    good = hit.filter((a) => Math.abs(a.dev) <= GOOD_MS);
  const beatsWith = new Map();
  for (const a of ex) {
    const b = Math.floor(a.t + 1e-9);
    beatsWith.set(b, (beatsWith.get(b) || false) || a.dev !== undefined);
  }
  const cont = beatsWith.size ? [...beatsWith.values()].filter(Boolean).length / beatsWith.size : 0,
    notes = ex.length ? hit.length / ex.length : 0,
    timing = hit.length ? good.length / hit.length : 0,
    mean = hit.length ? hit.reduce((s, a) => s + Math.abs(a.dev), 0) / hit.length : 0;
  const pieceOk = notes >= 0.8 && cont >= 0.8;
  recordSkill(ex[0] ? ex[0].item : "pcs:0", pieceOk, mean);
  // a missed note sends its interval back to the Intervals exercise
  for (const a of ex) if (a.dev === undefined && a.iv) recordSkill(a.iv, false, 0);
  P.i++;
  if (pieceOk) P.ok++;
  P.cont.push(cont);
  P.notes.push(notes);
  P.timing.push(timing);
  P.hits += hit.length;
  P.attacks += ex.length;
  hit.forEach((a) => P.devs.push(Math.abs(a.dev)));
  for (const a of ex) a.note.cls = a.dev === undefined ? "is-bad" : Math.abs(a.dev) <= GOOD_MS ? "is-ok" : "is-hint";
  draw();
  u.fb.className = "read-fb " + (pieceOk ? "ok" : "bad");
  let msg = t("perf_cont", Math.round(cont * 100)) + " · " + t("notesPct", Math.round(notes * 100)) + " · " + t("timingPct", Math.round(timing * 100));
  if (P.extras) msg += " · " + t("perf_wrong", P.extras);
  u.fb.textContent = msg;
  afterPiece(true);
}

function afterPiece(counted) {
  const u = P.ui;
  progress();
  u.area.textContent = "";
  u.actions.textContent = "";
  const done = counted && (P.total !== Infinity ? P.i >= P.total : performance.now() - P.started >= P.opts.budget);
  const next = button(done ? t("perf_finish") : t("perf_next"), "btn perf-go", () => (done ? finishRound(false) : nextPiece()));
  u.actions.append(button(t("perf_again"), "btn2", () => nextPiece(true)), next);
  if (P.ex.tempoKey) u.actions.prepend(tempoControl());
  next.focus();
  fitStage();
}

function finishRound(stopped) {
  const r = P;
  if (!r) return;
  P = null;
  const mean = r.devs.length ? Math.round(r.devs.reduce((a, b) => a + b, 0) / r.devs.length) : 0;
  const tempo = r.piece ? r.piece.tempo : 0;
  clearInterval(r.studyTimer);
  const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
  const pitched = r.cont.length > 0;
  const s = { ex: r.ex.id, level: r.level, n: r.i, ok: r.ok, stopped, dur: performance.now() - r.started };
  if (pitched) Object.assign(s, { cont: avg(r.cont), notes: avg(r.notes), timing: avg(r.timing) });
  if (r.i > 0) {
    addRound(Object.assign({ ex: r.ex.id, level: r.level, n: r.i, ok: r.ok, ms: mean, tempo }, pitched ? { cont: Math.round(s.cont * 100) / 100 } : {}));
    // The tempo follows the results: a little faster after a good round, slower after a hard one.
    const acc = r.attacks ? r.hits / r.attacks : 0;
    let next = tempo;
    if (r.ex.tempoKey && !stopped) {
      const good = pitched ? s.cont >= 0.9 && s.notes >= 0.9 : acc >= 0.9 && mean <= r.ex.thr;
      if (good) next = tempo + 4;
      else if ((pitched ? s.cont : acc) < 0.7) next = Math.max(40, tempo - 4);
      setTempo(r.ex.tempoKey(r.level), next);
    }
    const box = el("div", "perf-sum");
    if (!pitched) box.appendChild(el("p", "", t("perf_sumHits", Math.round(acc * 100)) + " · " + t("perf_mean", mean)));
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
  tap(two ? (ev.midi >= 60 ? "hi" : "lo") : "any", ev.time, ev.midi);
});

document.addEventListener("keydown", (e) => {
  if ($("exRun").classList.contains("hide") || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (!P && !cal) return;
  const k = e.key.toLowerCase();
  const playing = (P && (P.phase === "count" || P.phase === "play")) || (cal && cal.phase === "run");
  if (playing) {
    if (k === "escape") return;
    e.preventDefault();
    // ↑ / ↓ change the tempo while playing
    if ((k === "arrowup" || k === "arrowdown") && P && P.tempoStep) return P.tempoStep(k === "arrowup" ? 4 : -4)();
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
