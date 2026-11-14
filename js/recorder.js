// MIDI (Web MIDI) recording during a live session.
import { uid } from "./util.js";
import { emit } from "./bus.js";
import { state, saveRun } from "./store.js";
import { putClip } from "./clips.js";

export const MIDI_OK = !!navigator.requestMIDIAccess;
const PPQ = 480,
  TEMPO_US = 500000; // 120 BPM: one quarter note = 500 ms

const midi = { access: null, input: null, asked: false };
const held = new Set();
/** Keys held down right now. */
export const heldKeys = () => held;
let mrec = null; // {startedAt, events, notes}

/** Message shown under the record buttons: {key, args} for i18n, or null. */
export let message = null;
function say(key, ...args) {
  message = key ? { key, args } : null;
  emit("rec");
}

export const recording = () => !!mrec;
export const recInfo = () => ({
  midi: mrec && { startedAt: mrec.startedAt, notes: mrec.notes },
});

// ---------- MIDI ----------
export function midiStatusKey() {
  if (!MIDI_OK) return null;
  if (!midi.access) return midi.asked ? { key: "midiDenied", args: [] } : null;
  return midi.input ? { key: "pianoIs", args: [midi.input.name] } : { key: "noPiano", args: [] };
}
function showMidiStatus() {
  const s = midiStatusKey();
  message = s;
  emit("rec");
}

function pickInput() {
  const list = [...midi.access.inputs.values()];
  const prev = midi.input && list.find((p) => p.id === midi.input.id);
  const next = prev || list.find((p) => /kawai|usb midi/i.test(p.name)) || list[0] || null;
  if (midi.input && midi.input !== next) midi.input.onmidimessage = null;
  midi.input = next;
  if (next) next.onmidimessage = onMidi;
  if (!recording()) showMidiStatus();
}

export async function ensureMidi() {
  if (!MIDI_OK) return false;
  if (midi.access) return true;
  midi.asked = true;
  try {
    midi.access = await navigator.requestMIDIAccess({ sysex: false });
    midi.access.onstatechange = pickInput;
    pickInput();
    return true;
  } catch {
    showMidiStatus();
    return false;
  }
}

function onMidi(e) {
  const d = e.data;
  if (!d || !d.length) return;
  const st = d[0] & 0xf0;
  if (st === 0x90 && d[2] > 0) held.add(d[1]);
  else if (st === 0x80 || (st === 0x90 && d[2] === 0)) held.delete(d[1]);
  // Note events for the reading exercises, timed on the performance.now() clock.
  if (st === 0x90 && d[2] > 0) emit("noteon", { midi: d[1], vel: d[2], time: e.timeStamp || performance.now() });
  else if (st === 0x80 || (st === 0x90 && d[2] === 0)) emit("noteoff", { midi: d[1], time: e.timeStamp || performance.now() });
  if (!mrec || ![0x80, 0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0].includes(st)) return;
  mrec.events.push({ t: e.timeStamp, d: Array.from(d.slice(0, st === 0xc0 || st === 0xd0 ? 2 : 3)) });
  if (st === 0x90 && d[2] > 0) mrec.notes++;
}

function vlq(n) {
  const b = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    b.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return b;
}
/** Build a Standard MIDI File (format 0) from timestamped events. */
export function buildSMF(evs) {
  const start = Math.max(0, (evs.length ? evs[0].t : 0) - 200);
  const trk = [
    0x00,
    0xff,
    0x51,
    0x03,
    (TEMPO_US >> 16) & 255,
    (TEMPO_US >> 8) & 255,
    TEMPO_US & 255,
    0x00,
    0xff,
    0x58,
    0x04,
    4,
    2,
    24,
    8,
  ];
  let last = 0;
  evs.forEach((ev) => {
    const tk = Math.max(0, Math.round(((ev.t - start) * PPQ) / (TEMPO_US / 1000)));
    trk.push(...vlq(Math.max(0, tk - last)), ...ev.d);
    last = Math.max(last, tk);
  });
  trk.push(0x00, 0xff, 0x2f, 0x00);
  const n = trk.length;
  return new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    (PPQ >> 8) & 255,
    PPQ & 255,
    0x4d,
    0x54,
    0x72,
    0x6b,
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
    ...trk,
  ]);
}

export async function startMidi() {
  if (!state.run || state.run.pausedAt || mrec || !MIDI_OK) return;
  if (!(await ensureMidi())) return;
  if (!midi.input) return showMidiStatus();
  mrec = { startedAt: Date.now(), events: [], notes: 0 };
  showMidiStatus();
}

async function saveClip(blob, clip) {
  try {
    await putClip(clip.id, blob);
    state.run.clips.push(clip);
    saveRun();
  } catch {
    say("clipFail");
  }
}

export async function stopMidi() {
  if (!mrec) return;
  const r = mrec;
  mrec = null;
  const evs = r.events.slice(),
    end = performance.now();
  held.forEach((n) => evs.push({ t: end, d: [0x80, n, 0] }));
  evs.sort((a, b) => a.t - b.t);
  if (!r.notes) {
    say("noNotes");
    return;
  }
  if (state.run) {
    await saveClip(new Blob([buildSMF(evs)], { type: "audio/midi" }), {
      id: "c" + uid(),
      at: r.startedAt,
      dur: Math.round((Date.now() - r.startedAt) / 1000),
      mime: "audio/midi",
      notes: r.notes,
    });
  }
  showMidiStatus();
}

export async function stopAll() {
  await stopMidi();
}

export function refreshMessage() {
  if (!recording()) showMidiStatus();
}
export function clearMessage() {
  say(null);
}
