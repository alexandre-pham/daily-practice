// Tempo analysis of a MIDI recording: reads a Standard MIDI File, splits the notes
// between the hands and follows the tempo of each hand over time. No DOM here.

/** Parse a Standard MIDI File (format 0 or 1). Times are in seconds. */
export function parseMidi(buf) {
  const b = new Uint8Array(buf);
  let p = 0;
  const u32 = () => ((b[p++] << 24) | (b[p++] << 16) | (b[p++] << 8) | b[p++]) >>> 0;
  const u16 = () => (b[p++] << 8) | b[p++];
  const tag = () => String.fromCharCode(b[p++], b[p++], b[p++], b[p++]);
  const vlq = () => {
    let v = 0,
      c;
    do {
      if (p >= b.length) throw new Error("truncated");
      c = b[p++];
      v = (v << 7) | (c & 0x7f);
    } while (c & 0x80);
    return v;
  };
  if (b.length < 14 || tag() !== "MThd") throw new Error("not a MIDI file");
  const hlen = u32(),
    fmt = u16(),
    ntrk = u16(),
    div = u16();
  p = 8 + hlen;
  if (fmt > 1) throw new Error("unsupported format");
  if (div & 0x8000) throw new Error("SMPTE timing unsupported");

  const raw = [],
    tempos = [];
  for (let i = 0; i < ntrk && p + 8 <= b.length; i++) {
    const id = tag(),
      len = u32(),
      end = Math.min(b.length, p + len);
    if (id !== "MTrk") {
      p = end;
      continue;
    }
    let tick = 0,
      run = 0;
    while (p < end) {
      tick += vlq();
      let st = b[p];
      if (st & 0x80) p++;
      else st = run;
      if (st === 0xff) {
        const type = b[p++],
          l = vlq();
        if (type === 0x51 && l === 3) tempos.push({ tick, us: (b[p] << 16) | (b[p + 1] << 8) | b[p + 2] });
        if (type === 0x2f) {
          p = end;
          break;
        }
        p += l;
      } else if (st === 0xf0 || st === 0xf7) {
        p += vlq();
      } else {
        run = st;
        const hi = st & 0xf0,
          a = b[p++],
          c = hi === 0xc0 || hi === 0xd0 ? 0 : b[p++];
        raw.push({ tick, st: hi, a, c });
      }
    }
    p = end;
  }

  // Tick → seconds through the tempo map (120 BPM until the first tempo event).
  tempos.sort((x, y) => x.tick - y.tick);
  const segs = [{ tick: 0, sec: 0, us: 500000 }];
  tempos.forEach((tm) => {
    const s = segs[segs.length - 1];
    if (tm.tick === s.tick) s.us = tm.us;
    else segs.push({ tick: tm.tick, sec: s.sec + ((tm.tick - s.tick) * s.us) / div / 1e6, us: tm.us });
  });
  const sec = (tick) => {
    let s = segs[0];
    for (const x of segs) if (x.tick <= tick) s = x;
    return s.sec + ((tick - s.tick) * s.us) / div / 1e6;
  };

  raw.sort((x, y) => x.tick - y.tick);
  const notes = [],
    pedal = [],
    open = new Map();
  raw.forEach((e) => {
    const t = sec(e.tick);
    if (e.st === 0x90 && e.c > 0) {
      if (open.has(e.a)) {
        const n = open.get(e.a);
        n.dur = Math.max(0.02, t - n.t);
      }
      const n = { t, dur: 0, p: e.a, v: e.c };
      open.set(e.a, n);
      notes.push(n);
    } else if (e.st === 0x80 || e.st === 0x90) {
      const n = open.get(e.a);
      if (n) {
        n.dur = Math.max(0.02, t - n.t);
        open.delete(e.a);
      }
    } else if (e.st === 0xb0 && e.a === 64) {
      pedal.push({ t, down: e.c >= 64 });
    }
  });
  const last = raw.length ? sec(raw[raw.length - 1].tick) : 0;
  open.forEach((n) => (n.dur = Math.max(0.2, last - n.t)));
  if (!notes.length) throw new Error("no notes");

  // How long each note really rings: until the pedal comes up if it was down at release.
  const pe = [];
  pedal.forEach((x) => {
    if (!pe.length || pe[pe.length - 1].down !== x.down) pe.push(x);
  });
  notes.forEach((n) => {
    const off = n.t + n.dur;
    let down = false,
      upAt = Infinity;
    for (const x of pe) {
      if (x.t <= off) down = x.down;
      else if (down && !x.down) {
        upAt = x.t;
        break;
      }
    }
    n.ring = Math.min(down ? upAt : off, off + 8) - n.t;
  });
  notes.sort((x, y) => x.t - y.t || x.p - y.p);
  const start = notes[0].t;
  notes.forEach((n) => (n.t -= start)); // the analysis starts at the first note
  const duration = Math.max(...notes.map((n) => n.t + n.ring));
  return { notes, duration };
}

/**
 * Assign every note to a hand by following where each hand is on the keyboard:
 * a note goes to the hand whose recent register is closer. Handles a left hand
 * that climbs into the treble, which a fixed split point would get wrong.
 */
export function splitHands(notes) {
  let lc = 48,
    rc = 72; // starting centres: C3 and C5
  const GROUP = 0.045;
  for (let i = 0; i < notes.length; ) {
    let j = i;
    while (j < notes.length && notes[j].t - notes[i].t < GROUP) j++;
    const chord = notes.slice(i, j).sort((a, b) => a.p - b.p);
    if (chord.length === 1) {
      const n = chord[0];
      n.hand = Math.abs(n.p - lc) <= Math.abs(n.p - rc) ? "L" : "R";
    } else {
      // Split the chord at its widest gap if both hands are plausibly in it.
      let best = -1,
        gap = 0;
      for (let k = 1; k < chord.length; k++) {
        const g = chord[k].p - chord[k - 1].p;
        if (g > gap) {
          gap = g;
          best = k;
        }
      }
      const lo = chord[0].p,
        hi = chord[chord.length - 1].p;
      if (gap >= 5 && Math.abs(lo - lc) < Math.abs(lo - rc) && Math.abs(hi - rc) < Math.abs(hi - lc))
        chord.forEach((n, k) => (n.hand = k < best ? "L" : "R"));
      else {
        const mid = (lo + hi) / 2;
        const h = Math.abs(mid - lc) <= Math.abs(mid - rc) ? "L" : "R";
        chord.forEach((n) => (n.hand = h));
      }
    }
    const ls = chord.filter((n) => n.hand === "L"),
      rs = chord.filter((n) => n.hand === "R");
    if (ls.length) lc = lc * 0.7 + (ls.reduce((a, n) => a + n.p, 0) / ls.length) * 0.3;
    if (rs.length) rc = rc * 0.7 + (rs.reduce((a, n) => a + n.p, 0) / rs.length) * 0.3;
    if (rc - lc < 7) {
      const m = (lc + rc) / 2;
      lc = m - 3.5;
      rc = m + 3.5;
    }
    i = j;
  }
  return notes;
}

/** Onset times of one hand, with chords (notes within 45 ms) counted once. */
function onsets(notes, hand) {
  const out = [];
  notes.forEach((n) => {
    if (hand && n.hand !== hand) return;
    if (!out.length || n.t - out[out.length - 1] >= 0.045) out.push(n.t);
  });
  return out;
}

/** Most common short gap between notes, turned into a quarter-note tempo. */
export function estimateTempo(notes) {
  const on = onsets(notes);
  const gaps = [];
  for (let i = 1; i < on.length; i++) {
    const g = on[i] - on[i - 1];
    if (g >= 0.12 && g <= 1.2) gaps.push(g);
  }
  if (gaps.length < 4) return 100;
  // Smoothed histogram on a log scale, so 0.24 s and 0.25 s fall in one peak.
  let best = 0,
    bestScore = -1;
  for (let x = Math.log(0.12); x <= Math.log(1.2); x += 0.005) {
    let s = 0;
    gaps.forEach((g) => {
      const d = (Math.log(g) - x) / 0.04;
      s += Math.exp(-d * d);
    });
    if (s > bestScore) {
      bestScore = s;
      best = x;
    }
  }
  let bpm = 60 / Math.exp(best);
  while (bpm > 176) bpm /= 2;
  while (bpm < 56) bpm *= 2;
  return Math.round(bpm);
}

// Note values a gap can be, in quarter notes. 2/3 is left out: too close to 3/4.
const VALUES = [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2];
const TOL = 0.12;

/**
 * Follow the beat of one hand. Each gap between two notes is matched to the note
 * value it most likely is, given the tempo so far; gaps that match nothing well
 * (long notes, rests, hesitations) are skipped rather than guessed.
 * Returns [{t, beat}] where beat is the length of a quarter note in seconds.
 */
function follow(on, ref) {
  const q = 60 / ref,
    out = [];
  let L = q;
  for (let i = 1; i < on.length; i++) {
    const g = on[i] - on[i - 1];
    if (g < 0.09 || g > 2.2 * L) continue;
    let c = VALUES[0],
      err = Infinity;
    VALUES.forEach((v) => {
      const e = Math.abs(Math.log(g / L / v));
      if (e < err) {
        err = e;
        c = v;
      }
    });
    if (err > TOL) continue;
    const beat = g / c;
    out.push({ t: on[i], beat });
    L = Math.min(q * 1.4, Math.max(q * 0.7, L * 0.75 + beat * 0.25));
  }
  return out;
}

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Tempo (BPM) at time t from beat samples, over the last `win` seconds; null if too few. */
function tempoAt(samples, t, win) {
  const xs = [];
  for (const s of samples) {
    if (s.t > t) break;
    if (s.t >= t - win) xs.push(s.beat);
  }
  return xs.length >= 3 ? 60 / median(xs) : null;
}

/**
 * Full analysis. Series are sampled every `step` seconds over the whole piece.
 * @returns {{ref:number, duration:number, step:number, L:(number|null)[], R:(number|null)[], both:(number|null)[], counts:{L:number,R:number}}}
 */
export function analyze(parsed, ref, opts = {}) {
  const { notes, duration } = parsed;
  const win = opts.win || 4,
    step = opts.step || 0.1;
  const sL = follow(onsets(notes, "L"), ref),
    sR = follow(onsets(notes, "R"), ref);
  const sB = sL.concat(sR).sort((a, b) => a.t - b.t);
  const L = [],
    R = [],
    both = [];
  for (let t = 0; t <= duration + step / 2; t += step) {
    L.push(tempoAt(sL, t, win));
    R.push(tempoAt(sR, t, win));
    both.push(tempoAt(sB, t, win));
  }
  const k = Math.round((opts.smooth || 0.6) / step);
  return { ref, duration, step, L: smooth(L, k), R: smooth(R, k), both: smooth(both, k), counts: { L: sL.length, R: sR.length } };
}

/** Moving average over ±k samples; gaps stay gaps so the line still breaks where nothing was measured. */
function smooth(vals, k) {
  return vals.map((v, i) => {
    if (v == null) return null;
    let s = 0,
      n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(vals.length - 1, i + k); j++)
      if (vals[j] != null) {
        s += vals[j];
        n++;
      }
    return s / n;
  });
}

/** Value of a series at time t (seconds). */
export const valueAt = (a, series, t) => series[Math.max(0, Math.min(series.length - 1, Math.round(t / a.step)))];
