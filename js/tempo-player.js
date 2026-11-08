// Plays parsed MIDI notes with a small synthesized piano (Web Audio, no samples),
// scheduled ahead on the audio clock like the metronome. Position is in seconds of the piece.

const LOOKAHEAD_S = 0.25,
  TICK_MS = 40;

let wave = null;
function pianoWave(ctx) {
  if (wave) return wave;
  // A few decaying harmonics: plain enough to stay clean, enough to sound like a struck string.
  const amps = [0, 1, 0.55, 0.32, 0.2, 0.12, 0.08, 0.05, 0.03];
  wave = ctx.createPeriodicWave(new Float32Array(amps.length), Float32Array.from(amps));
  return wave;
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

  /** Current position in the piece, in seconds. */
  time() {
    if (!this.playing) return this.pos;
    return Math.min(this.duration, this.pos0 + (this.ctx.currentTime - this.t0) * this.rate);
  }

  /** Must be called from a user gesture the first time (browsers only allow audio after one). */
  play() {
    if (this.playing) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.8;
      this.out.connect(comp).connect(this.ctx.destination);
    }
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
        v.g.gain.setTargetAtTime(0, now, 0.015);
        v.o.stop(now + 0.1);
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
      this.voice(n, this.t0 + (n.t - this.pos0) / this.rate);
    }
    if (this.time() >= this.duration) {
      this.pause();
      this.pos = this.duration;
      if (this.onEnd) this.onEnd();
    }
  }

  voice(n, when) {
    const ctx = this.ctx,
      freq = 440 * Math.pow(2, (n.p - 69) / 12),
      o = ctx.createOscillator(),
      g = ctx.createGain(),
      lp = ctx.createBiquadFilter();
    o.setPeriodicWave(pianoWave(ctx));
    o.frequency.value = freq;
    // Louder notes are brighter; high notes die away faster than low ones.
    const vel = n.v / 127,
      peak = 0.22 * Math.pow(vel, 1.5),
      decay = Math.max(0.6, 4.5 - (n.p - 36) * 0.06),
      ring = Math.max(0.08, n.ring / this.rate),
      end = when + ring;
    lp.type = "lowpass";
    lp.frequency.value = Math.min(12000, freq * (3 + 9 * vel));
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.setTargetAtTime(peak * 0.25, when + 0.006, decay / 4);
    g.gain.setTargetAtTime(0.0001, end, 0.09);
    o.connect(lp).connect(g).connect(this.out);
    o.start(when);
    o.stop(end + 0.6);
    const v = { o, g };
    this.voices.add(v);
    o.onended = () => this.voices.delete(v);
  }
}
