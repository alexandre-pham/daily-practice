// Reading view: round setup, the note being asked, answer keys, results, mastery and history.
import { $, el } from "../util.js";
import { on } from "../bus.js";
import { t, fmt, lang } from "../i18n.js";
import { state } from "../store.js";
import { MIDI_OK, ensureMidi, midiStatusKey } from "../recorder.js";
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
  LEVELS,
  LENGTHS,
} from "../reading.js";
import { staff } from "./staff.js";

const DELAY_OK = 280,
  DELAY_WRONG = 1500;
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
  $("readMasterySec").classList.toggle("hide", running);
  $("readHistSec").classList.toggle("hide", running);
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

function renderRound() {
  const r = round,
    { clef, dn } = r.cur,
    fb = r.fb;
  $("readProg").textContent = t("progress", Math.min(r.i + (fb ? 0 : 1), r.total), r.total);
  $("readScore").textContent = t("scoreSoFar", r.ok);
  $("readBar").style.width = (r.i / r.total) * 100 + "%";
  $("readClef").textContent = read.prefs.clef === "tb" ? clefName(clef) : "";
  const cls = fb ? (fb.ok ? "is-ok" : "is-bad") : "";
  const box = $("readStaff");
  box.textContent = "";
  box.appendChild(staff(clef, [{ dn, cls }], { label: t("staffAria", clefName(clef)), width: 220 }));
  const fbEl = $("readFb");
  fbEl.className = "read-fb" + (fb ? (fb.ok ? " ok" : " bad") : "");
  fbEl.textContent = !fb ? "\u00a0" : fb.ok ? t("fbOk") : fb.wrongOctave ? t("fbOctave", noteName(dn)) : t("fbWrong", noteName(dn));
  const keys = $("readKeys");
  keys.textContent = "";
  for (let L = 0; L < 7; L++) {
    const b = el("button", "rkey");
    b.type = "button";
    b.append(el("span", "nm", noteName(L)));
    if (fb) {
      b.disabled = true;
      if (L === letterOf(dn)) b.classList.add("right");
      else if (L === fb.letter) b.classList.add("wrong");
    }
    b.addEventListener("click", () => give(L));
    keys.appendChild(b);
  }
  $("readHint").textContent = read.prefs.midi && MIDI_OK ? midiLine() : t("keysHint");
}

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
  $("readHistEmpty").classList.toggle("hide", read.history.length > 0);
  read.history.slice(0, 6).forEach((h) => {
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
function give(letter, midi) {
  if (!round || round.fb) return;
  const fb = answer(letter, midi);
  renderRound();
  clearTimeout(timer);
  timer = setTimeout(advance, fb.ok ? DELAY_OK : DELAY_WRONG);
}
function advance() {
  if (!round) return;
  if (roundOver()) endRound();
  else nextNote();
  renderRead();
}

const active = () => state.view === "read" && round && !document.querySelector(".modalwrap:not(.hide), #settings:not(.hide), #allSess:not(.hide)");

on("noteon", (midi) => {
  if (!active() || !read.prefs.midi) return;
  // A black key matches no letter, so it is always wrong (the round has no sharps or flats).
  give([0, 2, 4, 5, 7, 9, 11].indexOf(midi % 12), midi);
});
on("rec", () => {
  if (state.view === "read" && read.prefs.midi) renderRead();
});

export function initReading() {
  $("readStart").addEventListener("click", async () => {
    startRound();
    renderRead();
    if (read.prefs.midi) await ensureMidi();
    $("readKeys").querySelector("button")?.focus({ preventScroll: true });
  });
  $("readStop").addEventListener("click", () => {
    clearTimeout(timer);
    endRound();
    renderRead();
  });
  $("readAgain").addEventListener("click", () => {
    startRound();
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
    if (L < 0 || k.length !== 1) return;
    e.preventDefault();
    give(L);
  });
}
