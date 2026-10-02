// Sample-accurate metronome using the Web Audio clock (lookahead scheduling),
// so timing stays steady even when the main thread is busy.
import { readJSON, writeJSON } from "./util.js";

const LS_METRO = "suivi-metronome";
const LOOKAHEAD_S = 0.12; // schedule clicks this far ahead
const TICK_MS = 25; // scheduler wake-up interval
export const BPM_MIN = 30,
  BPM_MAX = 240;

const clamp = (v) => Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));

export class Metronome {
  constructor(onBeat) {
    const saved = readJSON(LS_METRO, {});
    this.bpm = clamp(saved.bpm || 60);
    this.beats = [0, 2, 3, 4, 6].includes(saved.beats) ? saved.beats : 4; // 0 = no accent
    this.onBeat = onBeat;
    this.ctx = null;
    this.running = false;
    this.timer = null;
    this.taps = [];
    this.usedBpm = null; // last tempo actually played, recorded with the session
  }

  save() {
    writeJSON(LS_METRO, { bpm: this.bpm, beats: this.beats });
  }

  setBpm(v) {
    this.bpm = clamp(v);
    this.save();
    if (this.running) this.usedBpm = this.bpm;
  }
  setBeats(n) {
    this.beats = n;
    this.beat = 0;
    this.save();
  }

  /** Must be called from a user gesture (browsers only allow audio after one). */
  start() {
    if (this.running) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this.ctx = new AC();
    this.ctx.resume();
    this.running = true;
    this.usedBpm = this.bpm;
    this.beat = 0;
    this.next = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  toggle() {
    this.running ? this.stop() : this.start();
  }

  schedule() {
    while (this.next < this.ctx.currentTime + LOOKAHEAD_S) {
      const accent = this.beats > 0 && this.beat % this.beats === 0;
      this.click(this.next, accent);
      const delay = Math.max(0, (this.next - this.ctx.currentTime) * 1000);
      const beatIndex = this.beats > 0 ? this.beat % this.beats : 0;
      setTimeout(() => this.running && this.onBeat && this.onBeat(beatIndex, accent), delay);
      this.next += 60 / this.bpm;
      this.beat++;
    }
  }

  click(when, accent) {
    const osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  /** Tap tempo: average interval of the last taps (reset after a 2 s gap). */
  tap() {
    const now = performance.now();
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length >= 2) {
      const span = this.taps[this.taps.length - 1] - this.taps[0];
      this.setBpm(60000 / (span / (this.taps.length - 1)));
    }
    return this.bpm;
  }
}
