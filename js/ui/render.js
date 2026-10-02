// Rendering: turns the current state into DOM. Event handlers for dynamic
// elements are provided by main.js through setActions() to avoid circular imports.
import { $, el, keyOf, dateOf, addDays, todayKey, weekStart, fmtDur, fmtClock, fmtSec } from "../util.js";
import { t, fmt, lang } from "../i18n.js";
import {
  state,
  act,
  goal,
  daily,
  liveActs,
  sessions,
  daySessions,
  dayTotals,
  streakFrom,
  bestStreak,
  sumRange,
  weekMinutes,
} from "../store.js";
import { activeMs, pausedMs, metro } from "../session.js";
import { MIDI_OK, recInfo, message as recMessage } from "../recorder.js";
import { getClip, extOf } from "../clips.js";
import { status as syncStatus, isConnected, isLocked, gistUrl } from "../sync.js";
import { lockScroll } from "./dialogs.js";

let actions = {};
export const setActions = (a) => {
  actions = a;
};

const ICON_EDIT = ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"];
const ICON_DEL = ["M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"];

// Built with DOM calls, not innerHTML, so the CSP can enforce Trusted Types.
function icon(paths) {
  const NS = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(NS, "svg");
  const attrs = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  };
  for (const k in attrs) svg.setAttribute(k, attrs[k]);
  paths.forEach((d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  });
  return svg;
}

// Object URLs for recordings currently on screen; revoked on each full render.
const urls = [];
function freeUrls() {
  while (urls.length) URL.revokeObjectURL(urls.pop());
}

export function renderAll() {
  freeUrls();
  renderHeader();
  renderView();
  renderSheet();
  renderSession();
  renderSync();
}

// ---------- header & activity menu ----------
// Tab icon: the current activity's initial on the app tile.
const XML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
let faviconFor = null;
function setFavicon(name) {
  const ch = (Array.from(name.trim())[0] || "?").toUpperCase();
  if (ch === faviconFor) return;
  faviconFor = ch;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1B2130"/>' +
    '<rect x="14" y="50" width="36" height="5" rx="2" fill="#C8324D"/><text x="32" y="43" text-anchor="middle" ' +
    'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="38" font-weight="700" fill="#fff">' +
    ch.replace(/[&<>"']/g, (c) => XML_ESC[c]) +
    "</text></svg>";
  $("favicon").href = "data:image/svg+xml," + encodeURIComponent(svg);
}

function renderHeader() {
  const a = act();
  $("title").textContent = t("title", a.name);
  document.title = t("title", a.name);
  setFavicon(a.name);
  const menu = $("actMenu");
  menu.textContent = "";
  liveActs().forEach((id) => {
    const b = el("button", id === state.cur ? "sel" : "");
    b.setAttribute("role", "menuitem");
    b.append(
      el("span", "", state.data.acts[id].name + (state.run && state.run.act === id ? " ●" : "")),
      el("span", "chk", id === state.cur ? "✓" : ""),
    );
    b.addEventListener("click", () => actions.pickActivity(id));
    menu.appendChild(b);
  });
  menu.appendChild(el("div", "sep"));
  const add = el("button", "add", t("newActMenu"));
  add.setAttribute("role", "menuitem");
  add.addEventListener("click", () => actions.newActivity());
  menu.appendChild(add);
}

function renderView() {
  const sess = state.view === "sess";
  $("tabSess").setAttribute("aria-selected", String(sess));
  $("tabStats").setAttribute("aria-selected", String(!sess));
  $("viewSess").classList.toggle("hide", !sess);
  $("viewStats").classList.toggle("hide", sess);
  if (sess) renderSessions();
  else renderStats();
}

// ---------- sessions view ----------
export function renderSessions() {
  const tot = dayTotals(state.cur),
    s = streakFrom(tot),
    w = weekMinutes(tot),
    g = goal(),
    d = daily();
  $("streak").textContent = s;
  $("streakLbl").textContent = s > 1 ? t("streakN") : t("streak1");
  $("week").textContent = w;
  $("weekBar").style.width = Math.min(100, (w / g) * 100) + "%";
  $("todayLine").textContent = (tot[todayKey()] || 0) + " / " + d + " min";
  const yesterday = keyOf(addDays(new Date(), -1));
  $("warn").classList.toggle("hide", !!tot[todayKey()] || !!tot[yesterday] || !Object.keys(tot).length);
  $("lgLess").textContent = t("less", d);
  $("lgMore").textContent = t("more", d);
  renderCalendar(tot);
  renderDay();
}

function renderCalendar(tot) {
  const today = new Date(),
    tk = todayKey(),
    d = daily();
  const start = addDays(weekStart(today), -28 + state.page * 35),
    end = addDays(start, 34);
  $("calTitle").textContent = state.page === 0 ? t("last5") : fmt.dayMon.format(start) + " – " + fmt.dayMon.format(end);
  $("next").disabled = state.page >= 0;
  const grid = $("grid");
  grid.textContent = "";
  t("dows").forEach((n) => grid.appendChild(el("div", "dow", n)));
  for (let i = 0; i < 35; i++) {
    const dd = addDays(start, i),
      k = keyOf(dd),
      m = tot[k] || 0;
    const level = m ? (m < d ? " l2" : " l4") : "";
    const b = el("button", "day" + level + (k === tk ? " is-today" : "") + (k === state.selected ? " sel" : ""));
    const label = dd.getDate() === 1 ? "1 " + fmt.mon.format(dd).replace(".", "") : String(dd.getDate());
    b.append(el("span", "n", label), el("span", "m", m ? m + "′" : ""));
    b.setAttribute("aria-label", fmt.long.format(dd) + (m ? t("minutesA", m) : t("noSess")));
    if (k === state.selected) b.setAttribute("aria-current", "date");
    if (k > tk) b.disabled = true;
    else b.addEventListener("click", () => actions.selectDay(k));
    grid.appendChild(b);
  }
}

function sessLabel(s) {
  if (s.start && s.end)
    return fmt.time.format(new Date(s.start)) + " – " + fmt.time.format(new Date(s.end)) + " · " + fmtDur(s.min);
  return fmtDur(s.min) + t("byHand");
}
function clipSummary(clips) {
  const mi = clips.filter((c) => c.mime === "audio/midi").length,
    au = clips.length - mi,
    out = [];
  if (mi) out.push(t("recMidi", mi));
  if (au) out.push(t("recAudio", au));
  return out.join(" · ");
}

function renderDay() {
  const isToday = state.selected === todayKey();
  const lbl = fmt.long.format(dateOf(state.selected));
  $("dayLabel").textContent = isToday ? t("todayPrefix") + lbl : lbl.charAt(0).toUpperCase() + lbl.slice(1);
  const list = daySessions(state.selected),
    total = list.reduce((a, s) => a + (s.min || 0), 0);
  $("dayTotal").textContent = total ? fmtDur(total) : "";
  $("dayEmpty").classList.toggle("hide", !!list.length);
  $("dayEmpty").textContent = isToday ? t("emptyToday") : t("emptyDay");
  const ul = $("daySess");
  ul.textContent = "";
  list.forEach((s) => {
    const li = el("li"),
      row = el("div", "row"),
      txt = el("div", "txt");
    const sub = [];
    if (s.note) sub.push(s.note);
    if (s.bpm) sub.push(t("tempoAt", s.bpm));
    if (s.pause) sub.push(t("pauseOf", fmtDur(s.pause)));
    if (s.clips && s.clips.length) sub.push(clipSummary(s.clips));
    txt.append(el("div", "lbl", sessLabel(s)), el("div", "sub", sub.join(" · ") || "—"));
    const ed = el("button", "ghosticon");
    ed.appendChild(icon(ICON_EDIT));
    ed.setAttribute("aria-label", t("edit"));
    ed.addEventListener("click", () => actions.editSession(s));
    const del = el("button", "ghosticon del");
    del.appendChild(icon(ICON_DEL));
    del.setAttribute("aria-label", t("del"));
    del.addEventListener("click", () => actions.deleteSession(s));
    row.append(txt, ed, del);
    li.appendChild(row);
    if (s.clips && s.clips.length) {
      const cl = el("ul", "clips");
      s.clips.forEach((c, i) => cl.appendChild(clipItem(c, clipLabel(c, i, s.clips))));
      li.appendChild(cl);
    }
    ul.appendChild(li);
  });
  renderForm();
}

export function renderForm() {
  const e = state.editing && state.data.entries[state.editing];
  if (state.editing && (!e || e.deleted)) state.editing = null;
  $("addBtn").classList.toggle("hide", state.adding);
  $("addForm").classList.toggle("hide", !state.adding);
  $("formTitle").textContent = state.editing ? t("editSess") : t("forgot");
  $("saveAdd").textContent = state.editing ? t("update") : t("add");
  syncChips();
}
export function syncChips() {
  const v = Number($("minutes").value);
  document.querySelectorAll("#chips .chip").forEach((c) => c.setAttribute("aria-pressed", String(Number(c.dataset.min) === v)));
}

// ---------- recordings ----------
function clipLabel(c, i, all) {
  const isMidi = c.mime === "audio/midi";
  const n = all.slice(0, i + 1).filter((x) => (x.mime === "audio/midi") === isMidi).length;
  return (isMidi ? t("clipMidi") : t("clipAudio")) + n + " · " + fmtSec(c.dur) + (c.notes ? " · " + t("notes", c.notes) : "");
}
function clipItem(c, label) {
  const li = el("li");
  li.appendChild(el("span", "", label));
  getClip(c.id)
    .then((blob) => {
      if (!blob) {
        li.appendChild(el("span", "small", t("elsewhere")));
        return;
      }
      const u = URL.createObjectURL(blob);
      urls.push(u);
      const isMidi = c.mime === "audio/midi";
      if (!isMidi) {
        const audio = el("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.src = u;
        li.appendChild(audio);
      }
      const a = el("a", "", isMidi ? t("dlMid") : t("dl"));
      a.href = u;
      a.download =
        (isMidi ? "piano-" : "enregistrement-") +
        keyOf(new Date(c.at)) +
        "-" +
        fmt.time.format(new Date(c.at)).replace(":", "h") +
        "." +
        extOf(c.mime);
      li.appendChild(a);
    })
    .catch(() => li.appendChild(el("span", "small", t("unavailable"))));
  return li;
}

// ---------- live session ----------
export function tickClock() {
  if (!state.run) return;
  const c = fmtClock(activeMs());
  $("fClock").textContent = c;
  $("miniClock").textContent = c;
  $("runClock").textContent = c;
}

export function renderSession() {
  const r = state.run,
    running = !!r,
    paused = running && !!r.pausedAt;
  const runAct = running && state.data.acts[r.act] ? state.data.acts[r.act].name : "";
  $("startBtn").classList.toggle("hide", running);
  $("runBtn").classList.toggle("hide", !running);
  $("mini").classList.toggle("hide", !running || state.focusOpen);
  $("focus").classList.toggle("hide", !running || !state.focusOpen);
  lockScroll();
  if (!running) return;
  $("runLbl").textContent =
    (r.act === state.cur ? t("running") : t("runningOf", runAct)) + (paused ? t("pausedShort") : "") + " · ";
  $("miniLbl").textContent = runAct + (paused ? t("inPause") : "");
  $("mini").classList.toggle("is-paused", paused);
  $("fAct").textContent = t("runAct", runAct);
  $("focus").classList.toggle("is-paused", paused);
  const pm = Math.round(pausedMs() / 60000);
  $("fSince").textContent =
    t("startedAt", fmt.time.format(new Date(r.start))) + (pm ? t("pauseTotal", fmtDur(pm)) : "") + (paused ? t("inPause") : "");
  $("pauseBtn").textContent = paused ? t("resume") : t("pause");
  $("pauseBtn").setAttribute("aria-pressed", String(paused));
  if (document.activeElement !== $("runNote")) $("runNote").value = r.note || "";
  tickClock();
  renderRecording();
  renderMetronome();
}

export function renderRecording() {
  if (!state.run) return;
  const paused = !!state.run.pausedAt,
    info = recInfo();
  $("midiBtn").classList.toggle("hide", !MIDI_OK);
  $("midiBtn").classList.toggle("on", !!info.midi);
  $("midiBtn").setAttribute("aria-pressed", String(!!info.midi));
  $("midiBtn").disabled = paused;
  $("audioBtn").classList.toggle("on", !!info.audio);
  $("audioBtn").setAttribute("aria-pressed", String(!!info.audio));
  $("audioBtn").disabled = paused;
  $("midiLbl").textContent = info.midi
    ? t("midiStop", fmtSec((Date.now() - info.midi.startedAt) / 1000), info.midi.notes)
    : t("midiRec");
  $("audioLbl").textContent = info.audio ? t("audioStop", fmtSec((Date.now() - info.audio.startedAt) / 1000)) : t("audioRec");
  const msg = paused && !info.midi && !info.audio ? { key: "pausedMsg", args: [] } : recMessage;
  $("recMsg").textContent = msg ? t(msg.key, ...msg.args) : "";
  const ul = $("runClips");
  ul.textContent = "";
  state.run.clips.forEach((c, i) => ul.appendChild(clipItem(c, clipLabel(c, i, state.run.clips))));
}

export function renderMetronome() {
  const paused = !!(state.run && state.run.pausedAt);
  $("bpmVal").textContent = metro.bpm;
  if (document.activeElement !== $("bpmRange")) $("bpmRange").value = metro.bpm;
  $("metroBtn").textContent = metro.running ? t("metroStop") : t("metroStart");
  $("metroBtn").setAttribute("aria-pressed", String(metro.running));
  $("metroBtn").disabled = paused;
  $("metro").classList.toggle("is-on", metro.running);
  document
    .querySelectorAll("#beatsPick .chip")
    .forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.beats) === metro.beats)));
  $("silentHint").classList.toggle("hide", !/iPhone|iPad/.test(navigator.userAgent));
  const dots = $("beatDots");
  const n = Math.max(1, metro.beats || 1);
  if (dots.children.length !== n) {
    dots.textContent = "";
    for (let i = 0; i < n; i++) dots.appendChild(el("span", "bd"));
  }
}
export function flashBeat({ beat }) {
  const dots = $("beatDots").children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === beat);
}

// ---------- statistics ----------
function renderStats() {
  const tot = dayTotals(state.cur),
    list = sessions(state.cur),
    g = goal(),
    d = daily(),
    today = new Date();
  const w = weekMinutes(tot),
    s = streakFrom(tot),
    best = bestStreak(tot);
  let days30 = 0;
  for (let i = 0; i < 30; i++) if (tot[keyOf(addDays(today, -i))]) days30++;
  const total = list.reduce((a, x) => a + (x.min || 0), 0),
    nDays = Object.keys(tot).filter((k) => tot[k] > 0).length;
  const ws = weekStart(today),
    lastW = sumRange(tot, addDays(ws, -7), 7),
    last30 = sumRange(tot, addDays(today, -29), 30);

  const kp = $("kpis");
  kp.textContent = "";
  [
    [w + " min", t("kWeek", g)],
    [String(s), t("kStreak", s, best)],
    [days30 + " / 30", t("kDays")],
    [list.length ? fmtDur(total / list.length) : "–", t("kAvg")],
  ].forEach(([v, l]) => {
    const k = el("div", "kpi");
    k.append(el("div", "v", v), el("div", "l", l));
    kp.appendChild(k);
  });

  const vals = [];
  for (let i = 13; i >= 0; i--) {
    const dd = addDays(today, -i);
    vals.push({ dd, v: tot[keyOf(dd)] || 0, i });
  }
  const max = Math.max(d, ...vals.map((x) => x.v), 10);
  const chart = $("chart"),
    lbls = $("chartLbls");
  chart.textContent = "";
  lbls.textContent = "";
  const gl = el("div", "goal");
  gl.style.bottom = (d / max) * 100 + "%";
  gl.title = t("goalPerDay", d);
  chart.appendChild(gl);
  vals.forEach((x) => {
    const b = el("div", "b" + (x.v ? " on" : ""));
    b.style.height = (x.v / max) * 100 + "%";
    b.title = fmt.short.format(x.dd) + " : " + x.v + " min";
    chart.appendChild(b);
    lbls.appendChild(el("span", "", x.i === 0 ? t("todayShort") : x.i % 2 ? "" : fmt.dm.format(x.dd)));
  });
  chart.setAttribute("aria-label", t("chartAria", vals.map((x) => fmt.short.format(x.dd) + " " + x.v).join(", "), d));

  const dt = $("details");
  dt.textContent = "";
  [
    [t("total"), fmtDur(total)],
    [t("sessionsL"), String(list.length)],
    [t("perDay"), nDays ? fmtDur(total / nDays) : "–"],
    [t("lastWeek"), fmtDur(lastW)],
    [t("last30"), fmtDur(last30)],
  ].forEach(([l, v]) => {
    const li = el("li");
    li.append(el("span", "muted", l), el("span", "", v));
    dt.appendChild(li);
  });

  const buckets = [
    [t("morning"), 5, 12],
    [t("afternoon"), 12, 18],
    [t("evening"), 18, 23],
    [t("night"), 23, 29],
  ].map(([l, a, b]) => {
    const ss = list
      .filter((x) => x.start)
      .filter((x) => {
        let h = new Date(x.start).getHours();
        if (h < 5) h += 24;
        return h >= a && h < b;
      });
    return { l, n: ss.length, m: ss.reduce((q, x) => q + x.min, 0) };
  });
  const bm = Math.max(1, ...buckets.map((b) => b.m)),
    bt = $("byTime");
  bt.textContent = "";
  buckets.forEach((b) => {
    const tr = el("span", "tr"),
      i = el("i");
    i.style.width = (b.m / bm) * 100 + "%";
    tr.appendChild(i);
    bt.append(el("span", "small", b.l), tr, el("span", "muted small", b.n ? b.n + " · " + fmtDur(b.m) : "–"));
  });
}

// ---------- settings & sync status ----------
export function renderSheet() {
  const a = act();
  if (document.activeElement !== $("sName")) $("sName").value = a.name;
  if (document.activeElement !== $("sGoal")) $("sGoal").value = a.goal || 210;
  const only = liveActs().length <= 1;
  $("actDel").disabled = only;
  $("actDel").title = only ? t("keepOne") : "";
  document.querySelectorAll("#langPick .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}

export function renderSync() {
  const on = isConnected(),
    locked = isLocked(),
    st = syncStatus;
  $("connectBox").classList.toggle("hide", on);
  $("unlockBox").classList.toggle("hide", !locked);
  $("connectedBox").classList.toggle("hide", !on);
  $("syncNow").classList.toggle("hide", locked);
  $("lockNow").classList.toggle("hide", locked);
  ["dot", "hdrDot"].forEach((id) => {
    $(id).className = "sdot " + (st.state || "");
  });
  const box = $("syncTxt");
  box.textContent = t(st.key, ...st.args);
  if (st.key === "syncOk") {
    box.append(" ");
    const a = el("a", "", t("seeGist"));
    a.href = gistUrl();
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    box.appendChild(a);
  }
  $("hdrDot").title = box.textContent;
  $("hdrDot").setAttribute("aria-label", box.textContent);
}
