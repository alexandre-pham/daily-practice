// The exercise screen: a fullscreen panel that runs a round of an exercise, then shows the
// result. Question exercises ("quiz") are run here; timed ones ("perform") by js/ui/perform.js,
// which registers itself with registerRunner.
//
// Answers come from the MIDI piano when it is connected and chosen, else from buttons. Played
// notes are grouped: a sequence is judged note by note or once complete, notes pressed within a
// short time of each other form a chord.
import { $, el } from "../util.js";
import { on, emit } from "../bus.js";
import { t } from "../i18n.js";
import { MIDI_OK, midiStatusKey, heldKeys } from "../recorder.js";
import { read } from "../reading.js";
import { lockScroll } from "./dialogs.js";
import { exPrefs, recordSkill, addRound, skill } from "../exercises.js";
import { score } from "./score.js";
import { audio, piano, playList, hush } from "../sound.js";

const GROUP_GAP_MS = 220; // notes this close together form a chord
const DELAY_OK = 900,
  DELAY_BAD = 2300;

const runners = {};
export function registerRunner(kind, fn) {
  runners[kind] = fn;
}

/** The running exercise, or null. */
export let run = null;
export const isRunning = () => !!run;
export const midiMode = () => !!(read.prefs.midi && MIDI_OK);

// ---------- panel ----------
let returnFocus = null;
export function openPanel() {
  returnFocus = document.activeElement;
  $("exRun").classList.remove("hide");
  lockScroll();
}
export function closePanel() {
  $("exRun").classList.add("hide");
  $("exIn").textContent = "";
  lockScroll();
  if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus();
  emit("exdone");
}

/** Build the panel's frame: top bar, title, prompt, stage, feedback, answer area, hint. */
export function shell(title, onStop) {
  const box = $("exIn");
  box.textContent = "";
  $("exRun").setAttribute("aria-label", title);
  const top = el("div", "read-top");
  const stop = el("button", "iconbtn round");
  stop.type = "button";
  stop.setAttribute("aria-label", t("readStop"));
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg"),
    path = document.createElementNS(ns, "path");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  path.setAttribute("d", "M6 6l12 12M18 6L6 18");
  svg.appendChild(path);
  stop.appendChild(svg);
  stop.addEventListener("click", onStop);
  const bar = el("div", "bar"),
    fill = el("i");
  bar.appendChild(fill);
  const prog = el("span", "read-prog");
  top.append(stop, bar, prog);
  const head = el("div", "ex-head", title);
  const prompt = el("p", "ex-prompt");
  const stage = el("div", "read-stage ex-stage");
  const staff = el("div", "staffbox");
  stage.appendChild(staff);
  const fb = el("p", "read-fb");
  fb.setAttribute("aria-live", "polite");
  const area = el("div", "ex-area");
  const actions = el("div", "ex-actions");
  const hint = el("p", "muted small read-hint");
  box.append(top, head, prompt, stage, fb, area, actions, hint);
  return { box, stop, fill, prog, head, prompt, stage, staff, fb, area, actions, hint };
}

/** Screen pixels per SVG unit for scores, so they read at a comfortable size on any screen. */
export function fitScale(staves = 1) {
  const h = (6 + staves * 4 + (staves - 1) * 7) * 14,
    big = window.innerWidth >= 1800 ? 2.1 : window.innerWidth >= 960 ? 1.7 : window.innerWidth >= 700 ? 1.35 : 1.25;
  return Math.max(0.6, Math.min(big, (window.innerHeight * (staves > 1 ? 0.42 : 0.26)) / h));
}
/** Width in SVG units for a score filling a box (at most `max` units: short questions stay compact). */
export function fitWidth(box, staves = 1, max = 0) {
  const px = box.clientWidth || 340;
  let w = Math.round(px / fitScale(staves));
  if (max) w = Math.min(w, max);
  return Math.max(240, w);
}

export function midiHint() {
  if (!midiMode()) return "";
  const s = midiStatusKey();
  return s ? t(s.key, ...s.args) : t("answerPianoH");
}

export function button(label, cls, fn) {
  const b = el("button", cls || "btn2", label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}

// ---------- starting ----------
/**
 * Run an exercise. opts: {level, budget (ms, for the daily routine), onDone(summary), step}.
 */
export async function startExercise(ex, opts = {}) {
  hush();
  const p = exPrefs(ex);
  const level = opts.level || p.level;
  if (ex.needsAudio) {
    audio();
    piano(); // loads in the background; questions that need it wait for it
  }
  const fn = runners[ex.kind || "quiz"];
  if (!fn) return;
  openPanel();
  fn(ex, Object.assign({}, opts, { level, prefs: p }));
}

// ---------- quiz ----------
registerRunner("quiz", (ex, opts) => {
  const total = opts.budget ? Infinity : opts.prefs.len || 10;
  run = {
    ex,
    opts,
    level: opts.level,
    total,
    i: 0,
    ok: 0,
    times: [],
    missed: {},
    q: null,
    prev: null,
    started: performance.now(),
    answered: false,
    timer: 0,
    inp: null,
  };
  run.ui = shell(t("ex_" + ex.id) + " · " + t("levelN", run.level), stopQuiz);
  nextQuestion();
});

function stopQuiz() {
  if (!run) return;
  clearTimeout(run.timer);
  finishQuiz(true);
}

function nextQuestion() {
  const r = run;
  clearTimeout(r.timer);
  r.prev = r.q;
  r.q = r.ex.question(r.level, r.opts.prefs, r.prev);
  r.answered = false;
  r.inp = { pos: 0, notes: [], groups: [], group: null, first: 0 };
  drawQuestion();
  r.shownAt = performance.now();
  if (r.q.autoplay) playQ(r.q.autoplay);
}

function progress() {
  const r = run,
    u = r.ui;
  if (r.total === Infinity) {
    const used = performance.now() - r.started,
      left = Math.max(0, r.opts.budget - used);
    u.fill.style.width = Math.min(100, (used / r.opts.budget) * 100) + "%";
    u.prog.textContent = Math.floor(left / 60000) + ":" + String(Math.floor(left / 1000) % 60).padStart(2, "0");
  } else {
    u.fill.style.width = (r.i / r.total) * 100 + "%";
    u.prog.textContent = t("progress", r.i, r.total);
  }
}

function drawQuestion(marks) {
  const r = run,
    q = r.q,
    u = r.ui;
  progress();
  const useChoices = q.choices && (!midiMode() || !q.expect || q.expect.kind === "none");
  const prompt = useChoices && q.promptChoices ? q.promptChoices : q.prompt;
  u.prompt.textContent = prompt || "";
  u.prompt.classList.toggle("hide", !prompt);
  u.staff.textContent = "";
  r.api = null;
  if (q.sc) {
    const scs = Array.isArray(q.sc) ? q.sc : [q.sc];
    scs.forEach((sc, k) => {
      const wrap = el("div", "ex-score");
      if (scs.length > 1) wrap.appendChild(el("span", "ex-score-n", String(k + 1)));
      u.staff.appendChild(wrap);
      const w = fitWidth(u.staff, sc.staves.length, q.maxW || 0);
      const api = score(sc, Object.assign({ width: w, even: !sc.time, gap: 56, label: q.label || "" }, q.scOpts || {}));
      // A short question keeps the same note size as a long one, centred, instead of being enlarged.
      if (q.maxW) wrap.style.maxWidth = Math.round(w * fitScale(sc.staves.length)) + "px";
      wrap.appendChild(api.svg);
      if (k === 0) r.api = api;
      (r.apis = r.apis || [])[k] = api;
    });
    if (marks) marks();
  }
  u.stage.classList.toggle("hide", !q.sc);
  u.fb.className = "read-fb";
  u.fb.textContent = "\u00a0";
  // answer area
  u.area.textContent = "";
  u.actions.textContent = "";
  if (q.play) {
    const row = el("div", "ex-plays");
    q.play.forEach((pl) => row.appendChild(button("▶ " + pl.label, "btn2 playbtn", () => playQ(pl.list))));
    u.area.appendChild(row);
  }
  if (useChoices) {
    const row = el("div", "ex-choices" + (q.choices.length > 4 ? " many" : ""));
    q.choices.forEach((c, i) => {
      const b = button(c.label.charAt(0).toUpperCase() + c.label.slice(1), "choice", () => {
        if (r.answered) return;
        b.classList.add(c.ok ? "right" : "wrong");
        answer(!!c.ok, { choice: i });
      });
      b.dataset.i = String(i);
      row.appendChild(b);
    });
    u.area.appendChild(row);
  }
  u.actions.appendChild(button(t("skip"), "read-skip", () => !r.answered && answer(false, { skipped: true })));
  u.hint.textContent = useChoices ? (q.choicesHint ? t(q.choicesHint) : "") : midiHint() + (q.hint ? (midiHint() ? " " : "") + q.hint : "");
}

async function playQ(list) {
  if (!audio()) return;
  await piano();
  hush();
  playList(list);
}

/** The answer area after a reply: the right choice is shown, buttons stop answering. */
function lockChoices(detail) {
  const r = run;
  r.ui.area.querySelectorAll(".choice").forEach((b) => {
    b.disabled = true;
    const c = r.q.choices[Number(b.dataset.i)];
    if (c && c.ok) b.classList.add("right");
  });
  void detail;
}

function answer(ok, detail = {}) {
  const r = run;
  if (!r || r.answered) return;
  r.answered = true;
  const q = r.q,
    ms = q.msFromFirst && r.inp.first ? r.inp.last - r.inp.first : performance.now() - r.shownAt;
  if (!detail.skipped || q.item) recordSkill(q.item, ok, ms);
  r.i++;
  if (ok) {
    r.ok++;
    r.times.push(ms);
  } else r.missed[q.item] = (r.missed[q.item] || 0) + 1;
  // feedback
  const u = r.ui;
  u.fb.className = "read-fb " + (ok ? "ok" : "bad");
  u.fb.textContent = detail.skipped ? t("skipped") + " " + (q.fb ? q.fb(false, detail) : "") : q.fb ? q.fb(ok, detail) : ok ? t("fbOk") : t("fbBad");
  if (q.mark && r.api) q.mark(r.apis || [r.api], ok, detail);
  lockChoices(detail);
  progress();
  u.actions.textContent = "";
  const cont = button(t("continue"), "read-skip", () => advance());
  u.actions.appendChild(cont);
  if (q.after) playQ(q.after);
  const done = r.total !== Infinity ? r.i >= r.total : performance.now() - r.started >= r.opts.budget;
  r.timer = setTimeout(advance, (ok ? DELAY_OK : DELAY_BAD) + (q.extraDelay || 0) + (done ? 300 : 0));
}

function advance() {
  const r = run;
  if (!r || !r.answered) return;
  clearTimeout(r.timer);
  const done = r.total !== Infinity ? r.i >= r.total : performance.now() - r.started >= r.opts.budget;
  if (done) finishQuiz(false);
  else nextQuestion();
}

function finishQuiz(stopped) {
  const r = run;
  if (!r) return;
  clearTimeout(r.timer);
  hush();
  if (r.inp && r.inp.group) clearTimeout(r.inp.group.timer);
  const ms = r.times.length ? r.times.reduce((a, b) => a + b, 0) / r.times.length : 0;
  const summary = { ex: r.ex.id, level: r.level, n: r.i, ok: r.ok, ms: Math.round(ms), stopped, dur: performance.now() - r.started, missed: r.missed };
  if (r.i > 0) addRound({ ex: r.ex.id, level: r.level, n: r.i, ok: r.ok, ms: Math.round(ms) });
  run = null;
  showResult(summary, r.ex, r.opts);
}

/** The result screen, shared by every runner. */
export function showResult(s, ex, opts) {
  if (opts.onDone && !s.stopped) {
    resultScreen(s, ex, opts, true);
    return;
  }
  if (s.n === 0 && s.stopped) {
    if (opts.onDone) opts.onDone(s);
    else closePanel();
    return;
  }
  resultScreen(s, ex, opts, false);
}

function resultScreen(s, ex, opts, routine) {
  const box = $("exIn");
  box.textContent = "";
  const card = el("section", "ex-result");
  card.appendChild(el("h2", "", t("doneT")));
  card.appendChild(el("p", "muted", t("ex_" + ex.id) + " · " + t("levelN", s.level)));
  const nums = el("div", "done-nums");
  if (s.cont !== undefined) {
    nums.appendChild(el("div", "big", Math.round(s.cont * 100) + " %"));
    const d = el("div");
    d.appendChild(el("div", "", t("contL")));
    d.appendChild(el("div", "muted small", t("notesPct", Math.round((s.notes || 0) * 100)) + (s.timing !== undefined ? " · " + t("timingPct", Math.round(s.timing * 100)) : "")));
    nums.appendChild(d);
  } else {
    nums.appendChild(el("div", "big", s.ok + "/" + s.n));
    const d = el("div");
    d.appendChild(el("div", "", t("doneAcc", s.n ? Math.round((s.ok / s.n) * 100) : 0)));
    if (s.ms) d.appendChild(el("div", "muted small", t("doneTimeQ", (s.ms / 1000).toFixed(1).replace(".", t("locale") === "fr-FR" ? "," : "."))));
    nums.appendChild(d);
  }
  card.appendChild(nums);
  if (s.extra) card.appendChild(s.extra);
  const weak = Object.keys(s.missed || {}).filter((k) => ex.itemLabel);
  if (weak.length) {
    card.appendChild(el("div", "rlab", t("toReview")));
    const ul = el("ul", "weaklist");
    weak.slice(0, 6).forEach((k) => ul.appendChild(el("li", "", ex.itemLabel(k))));
    card.appendChild(ul);
  }
  const btns = el("div", "btns");
  if (routine) {
    btns.appendChild(button(t("continue"), "btn", () => opts.onDone(s)));
  } else {
    btns.appendChild(button(t("again"), "btn", () => startExercise(ex, { level: s.level })));
    btns.appendChild(button(t("close"), "btn2", () => closePanel()));
  }
  card.appendChild(btns);
  box.appendChild(card);
  const first = btns.querySelector("button");
  if (first) first.focus();
}

// ---------- MIDI input ----------
function judgeSeq(q, notes) {
  const e = q.expect;
  if (q.judge) return q.judge(notes);
  const want = expectedAt(e, notes);
  const ok = want.every((w, i) => match(w, notes[i]));
  return { ok, notes };
}
/** Expected note i: {midi} exact, {pc} any octave, or rel: semitones from the first note played. */
function expectedAt(e, notes) {
  if (e.rel) return e.rel.map((d, i) => (i === 0 ? { pc: e.pc0 } : { midi: notes[0] + d }));
  return e.notes;
}
const match = (w, m) => m !== undefined && (w.midi !== undefined ? w.midi === m : ((m % 12) + 12) % 12 === w.pc);

function onNote(ev) {
  const r = run;
  if (!r || r.answered || !r.q || !r.q.expect || !midiMode()) return;
  const e = r.q.expect,
    inp = r.inp;
  if (!inp.first) inp.first = ev.time;
  inp.last = ev.time;
  if (e.kind === "seq") {
    inp.notes.push(ev.midi);
    if (r.q.onNote) r.q.onNote(r.apis || [r.api], inp.notes);
    const n = e.rel ? e.rel.length : e.notes.length;
    if (e.step) {
      const want = expectedAt(e, inp.notes)[inp.notes.length - 1];
      if (!match(want, ev.midi)) return answer(false, { notes: inp.notes.slice(), at: inp.notes.length - 1 });
      if (inp.notes.length >= n) answer(true, { notes: inp.notes.slice() });
      return;
    }
    if (inp.notes.length >= n) {
      const res = judgeSeq(r.q, inp.notes.slice(0, n));
      answer(res.ok, res);
    }
    return;
  }
  // chords: group notes played close together
  if (!inp.group) inp.group = { midis: [], timer: 0 };
  inp.group.midis.push(ev.midi);
  clearTimeout(inp.group.timer);
  inp.group.timer = setTimeout(closeGroup, GROUP_GAP_MS);
}
function onNoteOff() {
  const r = run;
  if (!r || !r.inp || !r.inp.group) return;
  if (heldKeys().size === 0) {
    clearTimeout(r.inp.group.timer);
    r.inp.group.timer = setTimeout(closeGroup, 40);
  }
}
function closeGroup() {
  const r = run;
  if (!r || r.answered || !r.inp.group) return;
  const g = [...new Set(r.inp.group.midis)].sort((a, b) => a - b);
  r.inp.group = null;
  const e = r.q.expect;
  if (e.kind === "chord") {
    const res = r.q.judge(g);
    return answer(res.ok, Object.assign({ got: g }, res));
  }
  if (e.kind === "chords") {
    r.inp.groups.push(g);
    const i = r.inp.groups.length - 1,
      res = r.q.judgeStep(g, i);
    if (r.q.onStep) r.q.onStep(r.apis || [r.api], i, res.ok);
    if (!res.ok) return answer(false, { at: i, got: g });
    if (r.inp.groups.length >= e.count) answer(true, { groups: r.inp.groups });
  }
}

on("noteon", onNote);
on("noteoff", onNoteOff);
on("rec", () => {
  if (run && run.ui && run.q && !run.answered) run.ui.hint.textContent = midiMode() ? midiHint() : run.ui.hint.textContent;
});

document.addEventListener("keydown", (e) => {
  if ($("exRun").classList.contains("hide") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    const stop = $("exIn").querySelector(".read-top .iconbtn");
    if (stop) stop.click();
    else closePanel();
    return;
  }
  if (!run || run.ex.kind === "perform") return;
  if (e.key === " " || e.key === "Enter") {
    if (e.target.closest && e.target.closest("button") && e.key === "Enter") return;
    e.preventDefault();
    if (run.answered) advance();
    else if (e.key === " ") answer(false, { skipped: true });
    return;
  }
  if (/^[1-9]$/.test(e.key) && !run.answered) {
    const b = run.ui.area.querySelector('.choice[data-i="' + (Number(e.key) - 1) + '"]');
    if (b) b.click();
  }
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => run && run.q && !run.answered && run.ex.kind !== "perform" && drawQuestion(), 150);
});

/** For the exercises: the current skill record (to fade hints as an item is learned). */
export const known = (key) => {
  const s = skill(key);
  return !!(s && s.n >= 3 && s.acc >= 0.8);
};
