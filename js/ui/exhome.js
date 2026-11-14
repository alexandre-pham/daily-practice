// Reading tab: the exercise path (one card per exercise), each exercise's settings, the theory
// lessons, and the way into the single-note drill (js/ui/reading.js), which keeps its own screen.
import { $, el } from "../util.js";
import { on, emit } from "../bus.js";
import { t, fmt, lang } from "../i18n.js";
import { state } from "../store.js";
import { MIDI_OK, ensureMidi, midiStatusKey } from "../recorder.js";
import { read, setPref } from "../reading.js";
import { renderRead } from "./reading.js";
import { lockScroll } from "./dialogs.js";
import { EXERCISES, exById, exPrefs, setExPref, exMastery, exRounds, pathOf, lessonRead, markLesson, namesMode } from "../exercises.js";
import { LESSONS, lessonById } from "../lessons.js";
import { score } from "./score.js";
import { startExercise } from "./exrun.js";

/** What the tab shows: "" the path, "notes" the note drill, or an exercise id. */
let sel = "";
const extra = []; // more sections for the home page (daily routine, benchmark), added by later modules

export function addHomeSection(fn) {
  extra.push(fn);
}
export function openExercise(id) {
  sel = id;
  renderReadTab();
  window.scrollTo(0, 0);
}

export function renderReadTab() {
  const home = !sel,
    notes = sel === "notes";
  $("exHome").classList.toggle("hide", !home);
  $("exPane").classList.toggle("hide", home || notes);
  $("notesPane").classList.toggle("hide", !notes);
  $("viewRead").dataset.pane = home ? "home" : notes ? "notes" : "ex";
  if (notes) renderRead();
  else if (home) renderHome();
  else renderPane(exById(sel));
}

// ---------- helpers ----------
export function chip(label, pressed, onClick, attrs = {}) {
  const b = el("button", "chip", label);
  b.type = "button";
  b.setAttribute("aria-pressed", String(pressed));
  for (const k in attrs) b.setAttribute(k, attrs[k]);
  b.addEventListener("click", onClick);
  return b;
}
export function group(label, chips, hint) {
  const wrap = el("div", "rgroup");
  const lab = el("div", "rlab", label);
  lab.id = "eg-" + Math.random().toString(36).slice(2, 8);
  const row = el("div", "chips");
  row.setAttribute("role", "group");
  row.setAttribute("aria-labelledby", lab.id);
  row.append(...chips);
  wrap.append(lab, row);
  if (hint) wrap.appendChild(el("p", "muted small rhint", hint));
  return wrap;
}
const pct = (x) => Math.round(x * 100) + " %";

// ---------- home: the path ----------
function renderHome() {
  const box = $("exHome");
  box.textContent = "";
  for (const fn of extra) {
    const s = fn();
    if (s) box.appendChild(s);
  }
  const sec = el("section", "sec expath");
  sec.appendChild(el("h2", "", t("pathT")));
  sec.appendChild(el("p", "muted small path-intro", t("pathIntro")));
  const grid = el("div", "excards");
  grid.appendChild(notesCard());
  for (const ex of EXERCISES) if (!ex.hidden) grid.appendChild(exCard(ex));
  sec.appendChild(grid);
  box.appendChild(sec);
  box.appendChild(lessonsSection());
}

function notesCard() {
  const b = cardShell(t("readT"), t("ex_notes_d"), () => openExercise("notes"));
  const all = Object.keys(state.data.read.notes).length;
  b.appendChild(el("div", "exmeta muted small", all ? t("notesSeen", all) : t("notSeen")));
  return b;
}

function exCard(ex) {
  const p = exPrefs(ex),
    path = pathOf(ex),
    m = exMastery(ex);
  const b = cardShell(t("ex_" + ex.id), t("ex_" + ex.id + "_d"), () => openExercise(ex.id));
  const meta = el("div", "exmeta");
  meta.appendChild(el("span", "lvl", t("levelOf", p.level, ex.levels.length)));
  if (path.passed) meta.appendChild(el("span", "passed", "✓ " + t("levelPassed", path.passed)));
  b.appendChild(meta);
  const bar = el("div", "mbar");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", m.seen ? t("masteryAria", pct(m.solid)) : t("notSeen"));
  const a = el("i", "m3"),
    c = el("i", "m2");
  a.style.width = m.solid * 100 + "%";
  c.style.width = m.mid * 100 + "%";
  bar.append(a, c);
  b.appendChild(bar);
  return b;
}

function cardShell(title, desc, onClick) {
  const b = el("button", "excard card");
  b.type = "button";
  b.appendChild(el("span", "ttl", title));
  b.appendChild(el("span", "desc muted small", desc));
  b.addEventListener("click", onClick);
  return b;
}

// ---------- one exercise ----------
function renderPane(ex) {
  const box = $("exPane");
  box.textContent = "";
  if (!ex) {
    sel = "";
    return renderReadTab();
  }
  const p = exPrefs(ex),
    path = pathOf(ex);
  const back = el("button", "linkbtn backlink", t("exBack"));
  back.type = "button";
  back.addEventListener("click", () => openExercise(""));
  box.appendChild(back);

  const card = el("section", "card read-setup expane");
  card.appendChild(el("h2", "", t("ex_" + ex.id)));
  card.appendChild(el("p", "muted read-intro", t("ex_" + ex.id + "_i")));
  const go = el("button", "primary cta");
  go.type = "button";
  go.appendChild(el("span", "", t("readStart")));
  go.addEventListener("click", async () => {
    if (read.prefs.midi && MIDI_OK) await ensureMidi();
    startExercise(ex, {});
  });
  card.appendChild(go);
  if (ex.needsMidi && !(read.prefs.midi && MIDI_OK)) card.appendChild(el("p", "warnline small", t("needsMidi")));

  const set = (k, v) => () => {
    setExPref(ex, k, v);
    renderPane(ex);
  };
  // levels
  const lv = [];
  for (let l = 1; l <= ex.levels.length; l++) {
    const passed = l <= path.passed;
    lv.push(chip((passed ? "✓ " : "") + l, p.level === l, set("level", l), { "aria-label": t("levelN", l) + (passed ? ", " + t("passedWord") : "") }));
  }
  let hint = t("ex_" + ex.id + "_l" + p.level);
  if (path.passed && p.level <= path.passed && path.next > p.level) hint += " " + t("tryNext", path.next);
  card.appendChild(group(t("levelL"), lv, hint));
  // the exercise's own settings
  for (const o of ex.options ? ex.options(p) : []) {
    card.appendChild(
      group(
        t(o.label),
        o.values.map((v) => chip(t(v.label), p[o.key] === v.v, set(o.key, v.v))),
        o.hint ? t(o.hint(p)) : "",
      ),
    );
  }
  if (ex.lengths && ex.lengths.length > 1)
    card.appendChild(
      group(
        t(ex.lengthLabel || "lenL"),
        ex.lengths.map((n) => chip(String(n), p.len === n, set("len", n))),
      ),
    );
  card.appendChild(
    group(t("namesL"), [
      chip("Do Ré Mi", namesMode() === "solf", () => (setPref("names", "solf"), renderPane(ex)), { lang: "fr" }),
      chip("C D E", namesMode() === "abc", () => (setPref("names", "abc"), renderPane(ex)), { lang: "en" }),
    ]),
  );
  if (MIDI_OK && !ex.noAnswerChoice)
    card.appendChild(
      group(
        t("answerL"),
        [
          chip(t("answerKeys"), !read.prefs.midi, () => (setPref("midi", false), renderPane(ex))),
          chip(t("answerPiano"), read.prefs.midi, async () => {
            setPref("midi", true);
            renderPane(ex);
            await ensureMidi();
            renderPane(ex);
          }),
        ],
        read.prefs.midi ? midiLine() : t(ex.buttonsHint || "answerButtonsH"),
      ),
    );
  if (ex.extraSetup) {
    const x = ex.extraSetup(p, () => renderPane(ex));
    if (x) card.appendChild(x);
  }
  box.appendChild(card);

  const side = el("div", "expane-side");
  if (ex.lessons && ex.lessons.length) {
    const ls = el("section", "sec");
    ls.appendChild(el("h2", "", t("lessonsT")));
    ls.appendChild(lessonList(ex.lessons));
    side.appendChild(ls);
  }
  const hs = el("section", "sec");
  hs.appendChild(el("h2", "", t("histT")));
  const rounds = exRounds(ex.id).slice(0, 6);
  if (!rounds.length) hs.appendChild(el("p", "muted empty-line", t("histEmpty")));
  else {
    const ul = el("ul", "rhist");
    for (const h of rounds) {
      const li = el("li");
      const res = ex.kind === "perform" && h.cont !== undefined ? t("contShort", pct(h.cont)) + ", " + h.ok + "/" + h.n : h.ok + "/" + h.n;
      li.append(el("span", "when", fmt.short.format(new Date(h.t))), el("span", "what muted", t("levelN", h.level) + (h.tempo ? ", ♩ = " + h.tempo : "")), el("span", "res", res));
      ul.appendChild(li);
    }
    hs.appendChild(ul);
  }
  side.appendChild(hs);
  box.appendChild(side);
}

function midiLine() {
  const s = midiStatusKey();
  return s ? t(s.key, ...s.args) : t("answerPianoH");
}

// ---------- lessons ----------
function lessonsSection() {
  const sec = el("section", "sec lessons-sec");
  sec.appendChild(el("h2", "", t("theoryT")));
  sec.appendChild(lessonList(LESSONS.map((l) => l.id)));
  return sec;
}
function lessonList(ids) {
  const ul = el("ul", "lessonlist");
  for (const id of ids) {
    const l = lessonById(id);
    if (!l) continue;
    const li = el("li");
    const b = el("button", "lessonbtn");
    b.type = "button";
    b.appendChild(el("span", "", l.title[lang] || l.title.fr));
    if (lessonRead(id)) b.appendChild(el("span", "seen muted small", "✓"));
    b.addEventListener("click", () => openLesson(id));
    li.appendChild(b);
    ul.appendChild(li);
  }
  return ul;
}

let lessonReturn = null;
export function openLesson(id) {
  const l = lessonById(id);
  if (!l) return;
  lessonReturn = document.activeElement;
  $("lessonTitle").textContent = l.title[lang] || l.title.fr;
  const body = $("lessonBody");
  body.textContent = "";
  for (const b of l.blocks) {
    const txt = (v) => (typeof v === "string" ? v : v[lang] || v.fr);
    if (b.type === "p") body.appendChild(el("p", "", txt(b.text)));
    else if (b.type === "list") {
      const ul = el("ul", "lessonul");
      for (const it of b.items) ul.appendChild(el("li", "", txt(it)));
      body.appendChild(ul);
    } else if (b.type === "staff") {
      const fig = el("figure", "lstaff");
      const api = score(typeof b.score === "function" ? b.score() : b.score, Object.assign({ width: 360, label: txt(b.caption || "") }, b.opts || {}));
      fig.appendChild(api.svg);
      if (b.caption) fig.appendChild(el("figcaption", "muted small", txt(b.caption)));
      body.appendChild(fig);
    }
  }
  markLesson(id);
  $("lessonDlg").classList.remove("hide");
  lockScroll();
  $("lessonClose").focus();
}
function closeLesson() {
  if ($("lessonDlg").classList.contains("hide")) return false;
  $("lessonDlg").classList.add("hide");
  lockScroll();
  if (lessonReturn && lessonReturn.focus) lessonReturn.focus();
  if (state.view === "read") renderReadTab();
  return true;
}

export function initExHome() {
  $("notesBack").addEventListener("click", () => openExercise(""));
  $("lessonClose").addEventListener("click", closeLesson);
  $("lessonBg").addEventListener("click", closeLesson);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && closeLesson()) e.stopImmediatePropagation();
  });
  const again = () => state.view === "read" && renderReadTab();
  on("data", again);
  on("lang", again);
  on("exdone", again);
  on("rec", () => state.view === "read" && sel && sel !== "notes" && renderReadTab());
}
export const refreshReadTab = () => emit("exdone");
