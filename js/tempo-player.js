// Plays parsed MIDI notes with a sampled grand piano (Salamander Grand Piano, see
// audio/piano/README.md), scheduled ahead on the audio clock like the metronome.
// Position is in seconds of the piece.

const LOOKAHEAD_S = 0.25,
  TICK_MS = 40,
  RELEASE_S = 0.35, // damper: how long a note takes to die away once released
  REVERB_WET = 0.16;

// One sample every minor third, A0 to C8; the notes in between are pitch-shifted.
const NAMES = ["C", "Ds", "Fs", "A"];
const SAMPLES = [];
for (let midi = 21; midi <= 108; midi += 3) {
  const pc = midi % 12;
  SAMPLES.push({ midi, file: NAMES[[0, 3, 6, 9].indexOf(pc)] + (Math.floor(midi / 12) - 1) + ".mp3" });
}

let buffers = null; // Map midi → AudioBuffer, shared by every player
let loading = null;

/** Load and decode all samples once; resolves when the piano is ready. */
export function loadPiano(ctx) {
  if (buffers) return Promise.resolve();
  if (!loading)
    loading = Promise.all(
      SAMPLES.map(async (s) => {
        const r = await fetch("audio/piano/" + s.file);
        if (!r.ok) throw new Error("sample " + s.file);
        const data = await r.arrayBuffer();
        // Safari only has the callback form of decodeAudioData.
        const buf = await new Promise((ok, ko) => ctx.decodeAudioData(data, ok, ko));
        return [s.midi, buf];
      }),
    ).then(
      (list) => {
        buffers = new Map(list);
      },
      (e) => {
        loading = null;
        throw e;
      },
    );
  return loading;
}

export const pianoReady = () => !!buffers;

/** Output chain shared by players: gain, a little room, a gentle compressor. */
export function pianoOut(ctx) {
  const comp = ctx.createDynamicsCompressor(),
    rev = ctx.createConvolver(),
    wet = ctx.createGain(),
    out = ctx.createGain();
  comp.threshold.value = -12;
  comp.ratio.value = 3;
  rev.buffer = roomImpulse(ctx);
  wet.gain.value = REVERB_WET;
  out.gain.value = 2.4;
  out.connect(comp);
  out.connect(rev).connect(wet).connect(comp);
  comp.connect(ctx.destination);
  return out;
}

/**
 * Sound one note {p: MIDI pitch, v: velocity, ring: seconds held} at audio time `when`.
 * Returns the voice {src, g} so it can be silenced.
 */
export function pianoVoice(ctx, out, n, when, rate = 1) {
  // Nearest sample; at most a semitone and a half of pitch shift.
  let s = SAMPLES[0];
  for (const x of SAMPLES) if (Math.abs(x.midi - n.p) < Math.abs(s.midi - n.p)) s = x;
  const src = ctx.createBufferSource(),
    g = ctx.createGain(),
    tone = ctx.createBiquadFilter();
  src.buffer = buffers.get(s.midi);
  src.playbackRate.value = Math.pow(2, (n.p - s.midi) / 12);
  // One velocity layer: soft notes are made quieter and darker, as on a real piano.
  const vel = n.v / 127;
  tone.type = "lowpass";
  tone.frequency.value = 900 + 17000 * vel * vel;
  tone.Q.value = 0.3;
  const peak = 0.85 * Math.pow(vel, 1.6),
    end = when + Math.max(0.05, n.ring / rate);
  g.gain.setValueAtTime(peak, when);
  g.gain.setTargetAtTime(0, end, RELEASE_S / 4);
  src.connect(tone).connect(g).connect(out);
  src.start(when);
  src.stop(end + RELEASE_S * 2);
  return { src, g };
}

/** A short synthetic room: decaying stereo noise, enough to take the dryness off. */
function roomImpulse(ctx) {
  const len = Math.round(ctx.sampleRate * 1.6),
    ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  return ir;
}

export class Player {
  constructor(notes, duration) {
    this.notes = notes;
    this.duration = duration;
    this.ctx = null;
    this.out = null;
    this.playing = false;
    this.rate = 1;
    this.pos = 0; // position when paused
    this.t0 = 0; // audio time matching position pos0
    this.pos0 = 0;
    this.next = 0; // index of the next note to schedule
    this.voices = new Set();
    this.timer = null;
    this.onEnd = null;
  }

  get ready() {
    return !!buffers;
  }

  /** Current position in the piece, in seconds. */
  time() {
    if (!this.playing) return this.pos;
    return Math.min(this.duration, this.pos0 + (this.ctx.currentTime - this.t0) * this.rate);
  }

  setup() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.out = pianoOut(this.ctx);
    return true;
  }

  /** Create the audio context (call it from a user gesture) and load the piano. */
  async prepare() {
    if (!this.setup()) throw new Error("no Web Audio");
    this.ctx.resume();
    await loadPiano(this.ctx);
  }

  play() {
    if (this.playing || !buffers || !this.setup()) return;
    this.ctx.resume();
    if (this.pos >= this.duration - 0.05) this.pos = 0;
    this.playing = true;
    this.pos0 = this.pos;
    this.t0 = this.ctx.currentTime + 0.05;
    this.next = this.notes.findIndex((n) => n.t >= this.pos);
    if (this.next < 0) this.next = this.notes.length;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  pause() {
    if (!this.playing) return;
    this.pos = this.time();
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this.silence();
  }

  seek(t) {
    const was = this.playing;
    if (was) this.pause();
    this.pos = Math.max(0, Math.min(this.duration, t));
    if (was) this.play();
  }

  setRate(r) {
    const was = this.playing;
    if (was) this.pause();
    this.rate = r;
    if (was) this.play();
  }

  destroy() {
    this.pause();
    if (this.ctx && this.ctx.close) this.ctx.close();
    this.ctx = null;
  }

  silence() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.voices.forEach((v) => {
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setTargetAtTime(0, now, 0.03);
        v.src.stop(now + 0.2);
      } catch {
        /* already stopped */
      }
    });
    this.voices.clear();
  }

  schedule() {
    if (!this.playing) return;
    const now = this.ctx.currentTime,
      horizon = this.pos0 + (now + LOOKAHEAD_S - this.t0) * this.rate;
    while (this.next < this.notes.length && this.notes[this.next].t <= horizon) {
      const n = this.notes[this.next++];
      if (n.t < this.pos0 - 0.01) continue;
      this.voice(n, Math.max(now, this.t0 + (n.t - this.pos0) / this.rate));
    }
    if (this.time() >= this.duration) {
      this.pause();
      this.pos = this.duration;
      if (this.onEnd) this.onEnd();
    }
  }

  voice(n, when) {
    const v = pianoVoice(this.ctx, this.out, n, when, this.rate);
    this.voices.add(v);
    v.src.onended = () => this.voices.delete(v);
  }
}
