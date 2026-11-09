// Entry point: wires DOM events to state changes and starts the app.
import { $, uid, todayKey, dateOf, fmtDur, DATE_RE } from "./util.js";
import { on } from "./bus.js";
import { t, fmt, applyStatic, setLang } from "./i18n.js";
import {
  state,
  load,
  changed,
  saveCur,
  saveRun,
  act,
  liveActs,
  sessions,
  newActId,
  normalize,
  merge,
  setData,
  payload,
  ensureActivity,
  updateSession,
} from "./store.js";
import { startMidi, stopMidi, recInfo, refreshMessage } from "./recorder.js";
import { metro, startSession, stopSession, cancelSession, togglePause, keepAwake, noteBpm } from "./session.js";
import { BPM_MIN, BPM_MAX } from "./metronome.js";
import { removeWithUndo, UNDO_DURATION } from "./undo.js";
import {
  toast,
  ask,
  openSheet,
  closeSheet,
  openNewAct,
  closeNewAct,
  initDialogs,
  closeTopOverlay,
  isOpen,
  openAllSess,
  openEdit,
  closeEdit,
  showEditError,
} from "./ui/dialogs.js";
import {
  setActions,
  renderAll,
  renderSessions,
  renderForm,
  syncChips,
  renderSession,
  renderRecording,
  renderMetronome,
  renderSync,
  renderSheet,
  renderAllSessions,
  resetAllSessions,
  showMoreSessions,
  tickClock,
  flashBeat,
} from "./ui/render.js";
import { initReading } from "./ui/reading.js";
import { initTempo, openTempo } from "./ui/tempo.js";
import { initAccount } from "./ui/account.js";
import { initCloudSync } from "./cloud-sync.js";
import { initCloudRecs } from "./cloud-recs.js";
import { initRecordings } from "./ui/recordings.js";

// ---------- actions used by dynamically rendered elements ----------
const actions = {
  pickActivity(id) {
    state.cur = id;
    saveCur();
    state.adding = false;
    closeMenu();
    renderAll();
  },
  newActivity() {
    closeMenu();
    openNewAct();
  },
  selectDay(day) {
    state.selected = day;
    state.adding = false;
    renderSessions();
  },
  editSession(s) {
    editingKey = s.key;
    $("edDay").value = s.day;
    $("edDay").max = todayKey();
    $("edMin").value = s.min;
    $("edNote").value = s.note || "";
    const times = !!(s.start && s.end);
    $("edTimes").classList.toggle("hide", !times);
    if (times) $("edTimes").textContent = t("recordedAt", fmt.time.format(s.start), fmt.time.format(s.end));
    openEdit();
  },
  openTempo(blob, label) {
    openTempo(blob, label);
  },
  deleteSession(s) {
    const undo = removeWithUndo({ entries: [s.key] });
    renderAll();
    toast(t("sessDeleted"), {
      onAction: () => {
        undo();
        toast(t("undone"));
      },
      duration: UNDO_DURATION,
    });
  },
};
setActions(actions);

// ---------- activity menu ----------
function openMenu() {
  $("actMenu").classList.remove("hide");
  $("actBtn").setAttribute("aria-expanded", "true");
  const first = $("actMenu").querySelector("button");
  if (first) first.focus();
}
function closeMenu() {
  $("actMenu").classList.add("hide");
  $("actBtn").setAttribute("aria-expanded", "false");
}
$("actBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("actMenu").classList.contains("hide") ? openMenu() : closeMenu();
});
document.addEventListener("click", (e) => {
  if (!$("actMenu").classList.contains("hide") && !$("actMenu").contains(e.target)) closeMenu();
});

// ---------- navigation ----------
$("tabSess").addEventListener("click", () => {
  state.view = "sess";
  renderAll();
  window.scrollTo(0, 0);
});
$("tabStats").addEventListener("click", () => {
  state.view = "stats";
  renderAll();
  window.scrollTo(0, 0);
});
$("tabRead").addEventListener("click", () => {
  state.view = "read";
  renderAll();
  window.scrollTo(0, 0);
});
$("tabRecs").addEventListener("click", () => {
  state.view = "recs";
  renderAll();
  window.scrollTo(0, 0);
});
$("prev").addEventListener("click", () => {
  state.page--;
  renderSessions();
});
$("next").addEventListener("click", () => {
  if (state.page < 0) {
    state.page++;
    renderSessions();
  }
});
$("setBtn").addEventListener("click", () => {
  closeMenu();
  renderSheet();
  openSheet();
});

// ---------- live session ----------
$("startBtn").addEventListener("click", startSession);
$("runBtn").addEventListener("click", () => {
  if (!state.run) return;
  if (state.cur !== state.run.act) {
    state.cur = state.run.act;
    saveCur();
  }
  state.focusOpen = true;
  renderAll();
});
$("miniOpen").addEventListener("click", () => {
  state.focusOpen = true;
  renderSession();
});
$("fClose").addEventListener("click", () => {
  state.focusOpen = false;
  renderSession();
});
async function finish() {
  const res = await stopSession($("runNote").value);
  if (res) toast(t("saved", fmtDur(res.min), res.pause ? fmtDur(res.pause) : ""));
}
$("finishBtn").addEventListener("click", finish);
$("miniFinish").addEventListener("click", finish);
$("cancelBtn").addEventListener("click", async () => {
  if (!state.run) return;
  const n = state.run.clips.length;
  if (await ask(t("cancelT"), t("cancelB", n), t("cancelSess"))) cancelSession();
});
$("pauseBtn").addEventListener("click", togglePause);
$("midiBtn").addEventListener("click", () => (recInfo().midi ? stopMidi() : startMidi()));
$("runNote").addEventListener("input", () => {
  if (!state.run) return;
  state.run.note = $("runNote").value;
  saveRun();
});

// ---------- metronome ----------
function setBpm(v) {
  metro.setBpm(v);
  noteBpm();
  renderMetronome();
}
$("metroBtn").addEventListener("click", () => {
  metro.toggle();
  noteBpm();
  renderMetronome();
  if (!metro.running) flashBeat({ beat: -1 });
});
$("bpmMinus").addEventListener("click", () => setBpm(metro.bpm - 1));
$("bpmPlus").addEventListener("click", () => setBpm(metro.bpm + 1));
$("bpmMinus5").addEventListener("click", () => setBpm(metro.bpm - 5));
$("bpmPlus5").addEventListener("click", () => setBpm(metro.bpm + 5));
$("bpmRange").min = BPM_MIN;
$("bpmRange").max = BPM_MAX;
$("bpmRange").addEventListener("input", (e) => setBpm(Number(e.target.value)));
$("tapBtn").addEventListener("click", () => {
  metro.tap();
  noteBpm();
  renderMetronome();
});
$("beatsPick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-beats]");
  if (!b) return;
  metro.setBeats(Number(b.dataset.beats));
  renderMetronome();
});
on("beat", flashBeat);

// ---------- manual sessions ----------
$("addBtn").addEventListener("click", () => {
  state.adding = true;
  $("minutes").value = "";
  $("note").value = "";
  renderForm();
  $("minutes").focus();
});
$("closeAdd").addEventListener("click", () => {
  state.adding = false;
  renderForm();
});
$("chips").addEventListener("click", (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  $("minutes").value = c.dataset.min;
  syncChips();
});
$("minutes").addEventListener("input", syncChips);
$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const min = Math.round(Number($("minutes").value));
  if (!min || min < 1) {
    toast(t("needMin"));
    $("minutes").focus();
    return;
  }
  const note = $("note").value.trim().slice(0, 500);
  state.data.entries[state.cur + "/" + state.selected + "/" + uid()] = { min: Math.min(min, 600), note, t: Date.now() };
  toast(t("added"));
  state.adding = false;
  $("minutes").value = "";
  $("note").value = "";
  changed();
  renderSessions();
});

// ---------- all sessions & editing ----------
let editingKey = null;
$("allBtn").addEventListener("click", () => {
  resetAllSessions();
  openAllSess();
  renderAllSessions();
});
$("allMore").addEventListener("click", showMoreSessions);
$("editForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const day = $("edDay").value,
    min = Math.round(Number($("edMin").value)),
    oldDay = editingKey ? editingKey.split("/")[1] : "";
  if (!DATE_RE.test(day) || day > todayKey()) {
    showEditError(t("needDay"));
    $("edDay").focus();
    return;
  }
  if (!(min >= 1)) {
    showEditError(t("needMin"));
    $("edMin").focus();
    return;
  }
  const key = updateSession(editingKey, { day, min: Math.min(min, 600), note: $("edNote").value.trim().slice(0, 500) });
  editingKey = null;
  closeEdit();
  if (!key) return; // deleted meanwhile, e.g. by a sync
  changed();
  renderAll();
  toast(day === oldDay ? t("updated") : t("moved", fmt.short.format(dateOf(day))));
});

// ---------- activities ----------
$("actForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("sName").value.trim().slice(0, 40),
    g = Math.round(Number($("sGoal").value));
  if (!name) {
    toast(t("needName"));
    return;
  }
  if (!(g >= 5)) {
    toast(t("needGoal"));
    return;
  }
  state.data.acts[state.cur] = Object.assign({}, act(), { name, goal: Math.min(g, 3000), t: Date.now() });
  changed();
  renderAll();
  toast(t("settingsSaved"));
});
$("actDel").addEventListener("click", async () => {
  if (liveActs().length <= 1) return;
  if (state.run && state.run.act === state.cur) {
    toast(t("finishFirst"));
    return;
  }
  const a = act(),
    id = state.cur,
    list = sessions(id);
  if (!(await ask(t("delActT", a.name), t("delActB", list.length), t("del")))) return;
  const undo = removeWithUndo({ acts: [id], entries: list.map((s) => s.key) });
  closeSheet();
  renderAll();
  toast(t("actDeleted", a.name), {
    duration: UNDO_DURATION,
    onAction: () => {
      undo();
      state.cur = id;
      saveCur();
      renderAll();
      toast(t("undone"));
    },
  });
});
$("newActForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("naName").value.trim().slice(0, 40),
    g = Math.round(Number($("naGoal").value)) || 210;
  if (!name) {
    toast(t("needName"));
    $("naName").focus();
    return;
  }
  const existing = liveActs().find((id) => state.data.acts[id].name.toLowerCase() === name.toLowerCase());
  if (existing) {
    state.cur = existing;
    saveCur();
    closeNewAct();
    renderAll();
    toast(t("actExists"));
    return;
  }
  const id = newActId(name);
  state.data.acts[id] = { name, goal: Math.max(5, Math.min(g, 3000)), t: Date.now(), created: Date.now() };
  state.cur = id;
  saveCur();
  changed();
  closeNewAct();
  renderAll();
  toast(t("actCreated"));
});

// ---------- language ----------
$("langPick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]");
  if (b) setLang(b.dataset.lang);
});
on("lang", () => {
  refreshMessage();
  renderAll();
});

// ---------- backup ----------
$("exp").addEventListener("click", () => {
  const blob = new Blob([payload()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "suivi-" + todayKey() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("imp").addEventListener("click", () => $("impFile").click());
$("impFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const inc = normalize(JSON.parse(reader.result)),
        now = Date.now();
      const n = Object.keys(inc.entries).filter((k) => !inc.entries[k].deleted).length;
      if (!n && !Object.keys(inc.acts).length) throw new Error("empty");
      // Imported records get a fresh timestamp so they win over tombstones on every device.
      for (const k in inc.entries) inc.entries[k] = Object.assign({}, inc.entries[k], { t: now });
      for (const k in inc.acts) inc.acts[k] = Object.assign({}, inc.acts[k], { t: now });
      setData(merge(state.data, inc));
      changed();
      renderAll();
      toast(t("imported", n));
    } catch {
      toast(t("badFile"));
    }
  };
  reader.readAsText(file);
});

on("data", () => {
  ensureActivity();
  renderAll();
});

// ---------- global ----------
on("render", renderAll);
on("rec", renderRecording);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (closeTopOverlay()) return;
  if (!$("actMenu").classList.contains("hide")) {
    closeMenu();
    $("actBtn").focus();
    return;
  }
  if (state.run && state.focusOpen) {
    state.focusOpen = false;
    renderSession();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  keepAwake();
  if (state.view === "sess" && !isOpen("settings")) renderSessions(); // the date may have changed
});
window.addEventListener("beforeunload", (e) => {
  const r = recInfo();
  if (r.midi) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setInterval(() => {
  tickClock();
  const r = recInfo();
  if (r.midi) renderRecording();
}, 1000);

// ---------- start ----------
initDialogs();
initReading();
initTempo();
load();
initCloudSync();
initCloudRecs();
initRecordings(actions);
initAccount();
on("cloudsync", renderSync);
on("account", renderSync);
applyStatic();
renderAll();
// The gist sync is gone: drop what it left on this device (the encrypted GitHub token included).
try {
  localStorage.removeItem("suivi-piano-gist");
  sessionStorage.removeItem("suivi-piano-unlock");
} catch {
  /* storage unavailable */
}
if (state.run) keepAwake();
