// Audio for the reading exercises: one AudioContext for metronome clicks and the sampled piano,
// and the mapping between the audio clock and the performance.now() clock that MIDI events use,
// so a key pressed and a click heard can be compared on one timeline.
import { loadPiano, pianoOut, pianoVoice, pianoReady } from "./tempo-player.js";

let ctx = null,
  out = null;
const voices = new Set();
const pending = new Set(); // clicks scheduled but not yet heard

/** Create or resume the audio context. Call it from a user gesture the first time. */
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    out = pianoOut(ctx);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
export const audioNow = () => (ctx ? ctx.currentTime : 0);

/** Load the piano samples (once). Resolves to false when Web Audio isn't available. */
export async function piano() {
  if (!audio()) return false;
  try {
    await loadPiano(ctx);
    return true;
  } catch {
    return false;
  }
}
export const hasPiano = () => pianoReady();

/** A metronome click at audio time `when`. */
export function click(when, accent = false, vol = 1) {
  if (!ctx) return;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime((accent ? 0.9 : 0.6) * vol, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.06);
  pending.add(osc);
  osc.onended = () => pending.delete(osc);
}

/** A piano note: MIDI pitch p, velocity v, held `dur` seconds, at audio time `when`. */
export function note(p, when, dur, v = 76) {
  if (!ctx || !pianoReady()) return;
  const vo = pianoVoice(ctx, out, { p, v, ring: dur }, when);
  voices.add(vo);
  vo.src.onended = () => voices.delete(vo);
}

/** Play a list of notes [{t (s from now), p, d (s), v}] starting a little after now. */
export function playList(list, lead = 0.08) {
  if (!audio()) return 0;
  const t0 = ctx.currentTime + lead;
  for (const n of list) note(n.p, t0 + n.t, n.d, n.v || 76);
  return t0;
}

/** Stop everything that is sounding or scheduled. */
export function hush() {
  if (!ctx) return;
  const now = ctx.currentTime;
  voices.forEach((v) => {
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setTargetAtTime(0, now, 0.03);
      v.src.stop(now + 0.2);
    } catch {
      /* already stopped */
    }
  });
  voices.clear();
  pending.forEach((o) => {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  });
  pending.clear();
}

/**
 * Pairs of matching times on both clocks: the audio time being heard right now and
 * performance.now(). getOutputTimestamp includes the output latency where the browser knows it.
 */
function stamp() {
  if (ctx.getOutputTimestamp) {
    const s = ctx.getOutputTimestamp();
    if (s && s.performanceTime > 0) return { a: s.contextTime, p: s.performanceTime };
  }
  return { a: ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0), p: performance.now() };
}
/** Audio time heard at a performance.now() time (e.g. a MIDI event's timestamp). */
export function audioAt(perfMs) {
  const s = stamp();
  return s.a + (perfMs - s.p) / 1000;
}
/** Audio time being heard right now (for drawing a cursor in step with the sound). */
export function heardNow() {
  return audioAt(performance.now());
}
