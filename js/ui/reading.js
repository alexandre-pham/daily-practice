// Reading view: round setup, the note being asked, answer keys, results, mastery and history.
import { $, el } from "../util.js";
import { on } from "../bus.js";
import { t, fmt, lang } from "../i18n.js";
import { state } from "../store.js";
import { MIDI_OK, ensureMidi, midiStatusKey } from "../recorder.js";
import { lockScroll } from "./dialogs.js";
import {
  read,
  round,
  lastResult,
  setPref,
  startRound,
  nextNote,
  answer,
  roundOver,
  endRound,
  dismissResult,
  notesOf,
  mastery,
  letterOf,
  midiOf,
  keyboardRange,
  history,
  LEVELS,
  LENGTHS,
} from "../reading.js";
import { staff, stream } from "./staff.js";

const DELAY_OK = 120,
  DELAY_WRONG = 1000;
const LETTER_KEYS = "cdefgab";
let timer = 0;

const namesMode = () => read.prefs.names || (lang === "fr" ? "solf" : "abc");
const noteName = (dn) => t(namesMode() === "solf" ? "notesSolf" : "notesAbc")[letterOf(dn)];
const clefName = (c) => t(c === "t" ? "clefNameT" : "clefNameB");
const secs = (ms) => new Intl.NumberFormat(t("locale"), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000);

function chip(label, pressed, onClick, attrs = {}) {
  const b = el("button", "chip", label);
  b.type = "button";
  b.setAttribute("aria-pressed", String(pressed));
  for (const k in attrs) b.setAttribute(k, attrs[k]);
  b.addEventListener("click", onClick);
  return b;
}
function group(labelKey, chips, hint) {
  const wrap = el("div", "rgroup");
  const id = "rg-" + labelKey;
  const lab = el("div", "rlab", t(labelKey));
  lab.id = id;
  const row = el("div", "chips");
  row.setAttribute("role", "group");
  row.setAttribute("aria-labelledby", id);
  row.append(...chips);
  wrap.append(lab, row);
  if (hint) wrap.appendChild(el("p", "muted small rhint", hint));
  return wrap;
}

// ---------- render ----------
export function renderRead() {
  const running = !!round;
  $("readSetup").classList.toggle("hide", running || !!lastResult);
  $("readRun").classList.toggle("hide", !running);
  $("readDone").classList.toggle("hide", running || !lastResult);
  lockScroll();
  if (running) renderRound();
  else if (lastResult) renderDone();
  else renderSetup();
  renderMastery();
  renderHistory();
}

function renderSetup() {
  const p = read.prefs,
    box = $("readOpts");
  box.textContent = "";
  const set = (k, v) => () => {
    setPref(k, v);
    renderRead();
  };
  box.append(
    group("clefL", [
      chip(t("clefT"), p.clef === "t", set("clef", "t")),
      chip(t("clefB"), p.clef === "b", set("clef", "b")),
      chip(t("clefBoth"), p.clef === "tb", set("clef", "tb")),
    ]),
    group(
      "rangeL",
      LEVELS.map((l) => chip(t("range_" + l), p.level === l, set("level", l))),
      t("rangeH_" + p.level),
    ),
    group(
      "kbdL",
      [chip(t("kbdOctave"), p.kbd === "octave", set("kbd", "octave")), chip(t("kbdScroll"), p.kbd === "scroll", set("kbd", "scroll"))],
      t("kbdH_" + p.kbd),
    ),
    group(
      "lenL",
      LENGTHS.map((n) => chip(String(n), p.len === n, set("len", n))),
    ),
    group("namesL", [
      chip("Do Ré Mi", namesMode() === "solf", set("names", "solf"), { lang: "fr" }),
      chip("C D E", namesMode() === "abc", set("names", "abc"), { lang: "en" }),
    ]),
  );
  if (MIDI_OK)
    box.appendChild(
      group(
        "answerL",
        [
          chip(t("answerKeys"), !p.midi, set("midi", false)),
          chip(t("answerPiano"), p.midi, async () => {
            setPref("midi", true);
            renderRead();
            await ensureMidi();
            renderRead();
          }),
        ],
        p.midi ? midiLine() : t("answerKeysH"),
      ),
    );
}

function midiLine() {
  const s = midiStatusKey();
  return s ? t(s.key, ...s.args) : t("answerPianoH");
}

const BLACK_AFTER = [0, 1, 3, 4, 5]; // black keys sit after C, D, F, G and A
const MIDDLE_C = 28;
let slide = false,
  tapped = null, // the key just pressed: {dn} for a white key, {black} for a black one
  centerKeys = false; // scroll the keyboard to middle C on the next render

/**
 * Width of the staff in SVG units for the space available, so a bigger screen shows more notes
 * rather than bigger ones: at most 0.95 screen pixels per unit and 20% of the screen height.
 */
function streamWidth(box) {
  const px = box.clientWidth || 360,
    scale = Math.min(0.95, (window.innerHeight * 0.2) / 140);
  return Math.max(260, Math.round(px / scale));
}

function renderRound() {
  const r = round,
    { clef, dn } = r.cur,
    fb = r.fb;
  $("readProg").textContent = t("progress", r.i, r.total);
  $("readBar").style.width = (r.i / r.total) * 100 + "%";
  const notes = r.queue.map((n, k) => ({ dn: n.dn, clef: n.clef, cls: k === 0 && fb ? (fb.ok ? "is-ok" : "is-bad") : "" }));
  const box = $("readStaff");
  box.textContent = "";
  box.appendChild(stream(notes, { label: t("staffAria", clefName(clef)), slide, width: streamWidth(box) }));
  slide = false;
  const fbEl = $("readFb");
  fbEl.className = "read-fb" + (fb ? (fb.ok ? " ok" : " bad") : "");
  fbEl.textContent = !fb ? "\u00a0" : fb.ok ? t("fbOk") : fb.wrongOctave ? t("fbOctave", noteName(dn)) : t("fbWrong", noteName(dn));
  renderKeys(fb, dn);
  $("readSkip").disabled = !!fb;
  $("readKbd").setAttribute("aria-pressed", String(read.prefs.kbd === "scroll"));
  const midi = read.prefs.midi && MIDI_OK;
  $("readHint").textContent = midi ? midiLine() : t("keysHint");
  $("readHint").classList.toggle("keys", !midi);
}

/**
 * The answer keyboard: one octave, where any key of the right name is right, or a scrollable
 * keyboard of several octaves, where only the key at the right pitch is.
 */
function renderKeys(fb, dn) {
  const scroll = read.prefs.kbd === "scroll",
    box = $("readKeys"),
    keep = box.scrollLeft;
  box.classList.toggle("scroll", scroll);
  box.textContent = "";
  const [lo, hi] = scroll ? keyboardRange() : [0, 6];
  const inner = el("div", "keys");
  inner.style.setProperty("--n", String(hi - lo + 1));
  box.appendChild(inner);
  // In the scrollable keyboard a key answers on click, so that a swipe scrolls instead.
  const press = (b, fn) => {
    if (scroll) b.addEventListener("click", fn);
    else {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        fn();
      });
      b.addEventListener("click", (e) => e.detail === 0 && fn()); // keyboard activation
    }
  };
  for (let k = lo; k <= hi; k++) {
    const b = el("button", "wk");
    b.type = "button";
    b.setAttribute("aria-label", noteName(k) + (scroll ? " " + octaveLabel(k) : ""));
    if (scroll && k === MIDDLE_C) b.classList.add("mid");
    if (fb) {
      const right = scroll ? k === dn : letterOf(k) === letterOf(dn);
      if (right) b.classList.add("right");
      else if (tapped && tapped.dn === k) b.classList.add("wrong");
    }
    press(b, () => {
      if (round && round.fb) return;
      tapped = { dn: k };
      if (scroll) give(letterOf(k), midiOf(k));
      else give(letterOf(k));
    });
    inner.appendChild(b);
    if (k < hi && BLACK_AFTER.includes(letterOf(k))) {
      const bk = el("button", "bk");
      bk.type = "button";
      bk.tabIndex = -1;
      bk.setAttribute("aria-hidden", "true");
      bk.style.setProperty("--i", String(k - lo + 1));
      if (fb && tapped && tapped.black === k) bk.classList.add("wrong");
      press(bk, () => {
        if (round && round.fb) return;
        tapped = { black: k };
        give(-1, scroll ? midiOf(k) + 1 : undefined);
      });
      inner.appendChild(bk);
    }
  }
  if (!scroll) return;
  const center = (key) => key.offsetLeft + key.offsetWidth / 2 - box.clientWidth / 2;
  box.scrollLeft = keep;
  if (centerKeys) {
    centerKeys = false;
    const mid = inner.querySelector(".mid");
    if (mid) box.scrollLeft = center(mid);
  } else if (fb && !fb.ok) {
    // After a mistake, bring the right key into view if it is off screen.
    const right = inner.querySelector(".wk.right");
    if (right && (right.offsetLeft < box.scrollLeft || right.offsetLeft + right.offsetWidth > box.scrollLeft + box.clientWidth))
      box.scrollTo({ left: center(right), behavior: "smooth" });
  }
}

/** Octave label for the screen reader on the scrollable keyboard, e.g. "4" for middle C's octave. */
const octaveLabel = (k) => String(Math.floor(k / 7));

function renderDone() {
  const r = lastResult;
  $("doneScore").textContent = r.ok + "/" + r.n;
  $("doneAcc").textContent = t("doneAcc", Math.round((r.ok / r.n) * 100));
  $("doneTime").textContent = r.ms ? t("doneTime", secs(r.ms)) : "";
  const miss = $("doneMiss");
  miss.textContent = "";
  if (!r.misses.length) {
    miss.appendChild(el("p", "muted", t("doneNoMiss")));
    return;
  }
  miss.appendChild(el("div", "rlab", t("doneMissT")));
  for (const c of ["t", "b"]) {
    const notes = r.misses.filter((m) => m.clef === c).sort((a, b) => a.dn - b.dn);
    if (!notes.length) continue;
    const fig = el("figure", "mstaff");
    fig.appendChild(staff(c, notes.map((m) => ({ dn: m.dn })), { label: clefName(c) + " : " + notes.map((m) => noteName(m.dn)).join(", ") }));
    const cap = el("figcaption", "muted small", notes.map((m) => noteName(m.dn)).join(", "));
    fig.appendChild(cap);
    miss.appendChild(fig);
  }
}

function renderMastery() {
  const box = $("readMastery");
  box.textContent = "";
  const clefs = read.prefs.clef === "tb" ? ["t", "b"] : [read.prefs.clef];
  const words = ["mUnseen", "mWeak", "mMid", "mGood"].map((k) => t(k));
  for (const c of clefs) {
    const notes = notesOf(c, read.prefs.level).map((dn) => ({ dn, cls: "m" + mastery(c, dn) }));
    const label = clefName(c) + ". " + notes.map((n) => noteName(n.dn) + " : " + words[Number(n.cls[1])]).join(", ");
    const fig = el("figure", "mstaff");
    fig.appendChild(staff(c, notes, { label, gap: 32 }));
    if (clefs.length > 1) fig.appendChild(el("figcaption", "muted small", clefName(c)));
    box.appendChild(fig);
  }
}

function renderHistory() {
  const list = $("readHist");
  list.textContent = "";
  const hist = history();
  $("readHistEmpty").classList.toggle("hide", hist.length > 0);
  hist.slice(0, 6).forEach((h) => {
    const li = el("li");
    const what = (h.clef === "tb" ? t("clefBoth") : t(h.clef === "t" ? "clefT" : "clefB")) + ", " + t("range_" + h.level).toLowerCase();
    li.append(
      el("span", "when", fmt.short.format(new Date(h.t))),
      el("span", "what muted", what),
      el("span", "res", h.ok + "/" + h.n + (h.ms ? ", " + t("perNote", secs(h.ms)) : "")),
    );
    list.appendChild(li);
  });
}

// ---------- answering ----------
function give(letter, midi, skipped) {
  if (!round || round.fb) return;
  const fb = answer(letter, midi, skipped);
  renderRound();
  clearTimeout(timer);
  timer = setTimeout(advance, fb.ok ? DELAY_OK : DELAY_WRONG);
}
function advance() {
  if (!round) return;
  tapped = null;
  if (roundOver()) endRound();
  else {
    nextNote();
    slide = true;
  }
  renderRead();
}

const active = () => !!round;

on("noteon", (midi) => {
  if (!active() || !read.prefs.midi) return;
  // A black key matches no letter, so it is always wrong (the round has no sharps or flats).
  give([0, 2, 4, 5, 7, 9, 11].indexOf(midi % 12), midi);
});
on("rec", () => {
  if (state.view === "read" && read.prefs.midi) renderRead();
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => round && renderRound(), 100);
});

export function initReading() {
  $("readStart").addEventListener("click", async () => {
    startRound();
    centerKeys = true;
    renderRead();
    if (read.prefs.midi) await ensureMidi();
  });
  $("readKbd").addEventListener("click", () => {
    setPref("kbd", read.prefs.kbd === "scroll" ? "octave" : "scroll");
    centerKeys = true;
    renderRound();
  });
  $("readSkip").addEventListener("click", () => {
    tapped = null;
    give(-1, undefined, true);
  });
  $("readStop").addEventListener("click", () => {
    clearTimeout(timer);
    endRound();
    renderRead();
  });
  $("readAgain").addEventListener("click", () => {
    startRound();
    centerKeys = true;
    renderRead();
  });
  $("readBack").addEventListener("click", () => {
    dismissResult();
    renderRead();
  });
  document.addEventListener("keydown", (e) => {
    if (!active() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea")) return;
    const k = e.key.toLowerCase();
    let L = LETTER_KEYS.indexOf(k);
    if (L < 0 && /^[1-7]$/.test(k)) L = Number(k) - 1;
    if (k === "escape") return $("readStop").click();
    if (k === " ") {
      e.preventDefault();
      return $("readSkip").click();
    }
    if (L < 0 || k.length !== 1) return;
    e.preventDefault();
    give(L);
  });
}
