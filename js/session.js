// Live practice session: start, pause, finish, cancel, plus the metronome and screen wake lock.
import { keyOf } from "./util.js";
import { emit } from "./bus.js";
import { state, saveRun, saveCur, changed, sessionKey } from "./store.js";
import { stopAll, ensureMidi, MIDI_OK } from "./recorder.js";
import { deleteClip } from "./clips.js";
import { Metronome } from "./metronome.js";

export const metro = new Metronome((beat, accent) => emit("beat", { beat, accent }));

let wake = null;
export async function keepAwake() {
  try {
    if (state.run && !state.run.pausedAt && navigator.wakeLock && document.visibilityState === "visible") {
      wake = await navigator.wakeLock.request("screen");
    }
  } catch {
    /* not supported or refused: harmless */
  }
}
function releaseWake() {
  try {
    if (wake) wake.release();
  } catch {
    /* ignore */
  }
  wake = null;
}

export function activeMs(now = Date.now()) {
  const r = state.run;
  return r ? (r.pausedAt || now) - r.start - (r.pausedMs || 0) : 0;
}
export function pausedMs(now = Date.now()) {
  const r = state.run;
  return r ? (r.pausedMs || 0) + (r.pausedAt ? now - r.pausedAt : 0) : 0;
}

/** Remember the tempo used, so it is saved with the session. */
export function noteBpm() {
  if (state.run && metro.running) {
    state.run.bpm = metro.bpm;
    saveRun();
  }
}

export function startSession() {
  if (state.run) return;
  state.run = { act: state.cur, start: Date.now(), note: "", clips: [], pausedMs: 0, pausedAt: null, bpm: null };
  state.focusOpen = true;
  saveRun();
  keepAwake();
  emit("render");
  if (MIDI_OK) ensureMidi();
}

export async function togglePause() {
  const r = state.run;
  if (!r) return;
  if (r.pausedAt) {
    r.pausedMs = (r.pausedMs || 0) + (Date.now() - r.pausedAt);
    r.pausedAt = null;
    keepAwake();
  } else {
    await stopAll();
    metro.stop();
    r.pausedAt = Date.now();
    releaseWake();
  }
  saveRun();
  emit("render");
}

/** Finish and save. Returns {min, pause} for the confirmation toast. */
export async function stopSession(note) {
  const r = state.run;
  if (!r) return null;
  await stopAll();
  metro.stop();
  const end = Date.now();
  if (r.pausedAt) {
    r.pausedMs = (r.pausedMs || 0) + (end - r.pausedAt);
    r.pausedAt = null;
  }
  const min = Math.min(600, Math.max(1, Math.round((end - r.start - (r.pausedMs || 0)) / 60000)));
  const pause = Math.round((r.pausedMs || 0) / 60000);
  const day = keyOf(new Date(r.start));
  const entry = { min, note: (note || "").trim().slice(0, 500), start: r.start, end, clips: r.clips, t: Date.now() };
  if (pause) entry.pause = pause;
  if (r.bpm) entry.bpm = r.bpm;
  state.data.entries[sessionKey(r.act, day)] = entry;
  if (state.cur !== r.act) {
    state.cur = r.act;
    saveCur();
  }
  state.run = null;
  state.selected = day;
  state.page = 0;
  state.focusOpen = false;
  state.view = "sess";
  saveRun();
  releaseWake();
  changed();
  emit("render");
  return { min, pause };
}

export async function cancelSession() {
  const r = state.run;
  if (!r) return;
  await stopAll();
  metro.stop();
  r.clips.forEach((c) => deleteClip(c.id));
  state.run = null;
  state.focusOpen = false;
  saveRun();
  releaseWake();
  emit("render");
}
