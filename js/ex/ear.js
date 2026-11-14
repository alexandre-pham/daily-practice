// Inner hearing: hear the music on the page before playing it.
import { t } from "../i18n.js";
import { midiOf, chordOnDegree, degreeRoot, rnd, pickOne } from "../theory.js";
import { pickByWeight } from "../exercises.js";
import { midiMode } from "../ui/exrun.js";

const LEVELS = [{ ab: true }, { two: true }, { two: true, rhythm: true }, { sing: true }, { two: true, harmony: true }];
const Q = 60 / 84; // a quarter note at 84 BPM, in seconds

/** A short melody on white keys from around middle C: diatonic numbers, by steps and skips. */
function walk(n, lo = 28, hi = 35) {
  let dn = lo + rnd(4);
  const out = [dn];
  for (let i = 1; i < n; i++) {
    let s;
    do s = pickOne([1, 1, 2, -1, -1, -2, 3, -3]);
    while (dn + s < lo || dn + s > hi + 2);
    dn += s;
    out.push(dn);
  }
  return out;
}
const contour = (dns) => dns.slice(1).map((d, i) => (d - dns[i] >= 0 ? "+" : "") + (d - dns[i])).join("");
/** Change one note (not the first) by a step or a skip. */
function vary(dns) {
  const v = dns.slice(),
    i = 1 + rnd(v.length - 1);
  v[i] += pickOne([1, -1, 2, -2]);
  return v;
}
const N = (dn) => ({ dn, acc: 0 });
const staffOf = (dns, durs) => ({ staves: [{ clef: "t" }], voices: [{ staff: 0, events: dns.map((dn, i) => ({ d: durs ? durs[i] : 1, notes: [N(dn)] })) }] });
const audioOf = (dns, durs) => {
  let tm = 0;
  return dns.map((dn, i) => {
    const d = (durs ? durs[i] : 1) * Q,
      n = { t: tm, p: midiOf(N(dn)), d: d * 0.95, v: 82 };
    tm += d;
    return n;
  });
};

// Rhythm cells of one or two beats, as durations in quarter notes.
const CELLS = [[1], [0.5, 0.5], [2], [1.5, 0.5]];
function rhythm() {
  const out = [];
  let beats = 0;
  while (beats < 4) {
    const c = pickOne(CELLS.filter((x) => x.reduce((a, b) => a + b, 0) <= 4 - beats));
    out.push(c);
    beats += c.reduce((a, b) => a + b, 0);
  }
  return out;
}
function varyRhythm(cells) {
  const v = cells.map((c) => c.slice()),
    i = rnd(v.length),
    len = v[i].reduce((a, b) => a + b, 0);
  const alts = CELLS.filter((c) => c.reduce((a, b) => a + b, 0) === len && c.join() !== v[i].join());
  if (len === 2 && !alts.length) alts.push([1, 1]);
  if (len === 1) alts.push([0.5, 0.5]);
  v[i] = pickOne(alts.length ? alts : [[0.5, 0.5]]);
  return v;
}

function question(level, p, prev) {
  const L = LEVELS[level - 1];
  const cands = [];
  for (let i = 0; i < 8; i++) {
    let c;
    if (L.rhythm) {
      const cells = rhythm(),
        durs = cells.flat(),
        dns = walk(durs.length);
      const cells2 = varyRhythm(cells),
        durs2 = cells2.flat();
      const dns2 = durs2.map((_, k) => dns[Math.min(k, dns.length - 1)]);
      c = { item: "ear:3:" + cells.map((x) => x.join("_")).join("-").replace(/\./g, "p"), a: [dns, durs], b: [dns2, durs2] };
    } else if (L.harmony) {
      const f = 0,
        degs = pickOne([[1, 5], [1, 4], [4, 1], [5, 1], [6, 4]]);
      const durs = [1, 1, 1, 1, 2, 1, 1];
      const dns = walk(durs.length, 30, 37);
      c = { item: "ear:5:" + contour(dns), a: [dns, durs], b: [vary(dns), durs], degs, f };
    } else {
      const dns = walk(L.sing ? 4 + rnd(2) : 3 + rnd(2));
      c = { item: "ear:" + level + ":" + contour(dns), a: [dns], b: [vary(dns)] };
    }
    if (!prev || c.item !== prev.item) cands.push(c);
  }
  const c = pickByWeight(cands, 6000);
  const accomp = (durs) => {
    if (!c.degs) return [];
    return c.degs.flatMap((d, bar) => chordOnDegree(0, d, degreeRoot(0, d, 21)).map((n) => ({ t: bar * 4 * Q, p: midiOf(n), d: 4 * Q * 0.95, v: 52 })));
  };
  const listen = (x) => audioOf(x[0], x[1]).concat(accomp(x[1]));
  const withChords = (x) => {
    const sc = staffOf(x[0], x[1]);
    sc.time = [4, 4];
    if (c.degs) {
      sc.staves.push({ clef: "b" });
      sc.voices.push({ staff: 1, events: c.degs.map((d) => ({ d: 4, notes: chordOnDegree(0, d, degreeRoot(0, d, 21)) })) });
    }
    return sc;
  };

  if (L.ab) {
    const aFirst = Math.random() < 0.5;
    const right = listen(c.a),
      other = listen(c.b);
    return {
      item: c.item,
      sc: staffOf(c.a[0]),
      maxW: 380,
      prompt: t("ear_promptAB"),
      expect: { kind: "none" },
      play: [
        { label: "A", list: aFirst ? right : other },
        { label: "B", list: aFirst ? other : right },
      ],
      choices: [
        { label: "A", ok: aFirst },
        { label: "B", ok: !aFirst },
      ],
      fb: (ok) => (ok ? t("ear_ok") : t("ear_was", aFirst ? "A" : "B")),
    };
  }
  if (L.sing) {
    const ms = c.a[0].map((dn) => midiOf(N(dn)));
    const piano = midiMode();
    return {
      item: c.item,
      sc: staffOf(c.a[0]),
      maxW: 420,
      prompt: piano ? t("ear_promptSing") : t("ear_promptSingNoPiano"),
      expect: piano ? { kind: "seq", notes: ms.map((m) => ({ midi: m })) } : { kind: "none" },
      judge: (got) => ({ ok: got.every((m, i) => m === ms[i]), got }),
      play: piano ? null : [{ label: t("ear_listen"), list: listen(c.a) }],
      choices: piano
        ? null
        : [
            { label: t("ear_selfYes"), ok: true },
            { label: t("ear_selfNo"), ok: false },
          ],
      after: piano ? listen(c.a) : null,
      extraDelay: piano ? 1500 : 0,
      fb: (ok) => (ok ? t("ear_ok") : t("ear_compare")),
      mark: (apis, ok, d) =>
        apis[0].events.forEach((e, i) => e._el && e._el.classList.add(ok ? "is-ok" : d && d.got && d.got[i] !== ms[i] ? "is-bad" : "is-hint")),
    };
  }
  // Two scores, one recording.
  const firstRight = Math.random() < 0.5;
  const scs = firstRight ? [withChords(c.a), withChords(c.b)] : [withChords(c.b), withChords(c.a)];
  if (!L.rhythm && !L.harmony) scs.forEach((s) => delete s.time);
  return {
    item: c.item,
    sc: scs,
    scOpts: { even: !(L.rhythm || L.harmony) },
    maxW: L.harmony ? 640 : 460,
    prompt: t("ear_promptTwo"),
    expect: { kind: "none" },
    play: [{ label: t("ear_listen"), list: listen(c.a) }],
    autoplay: listen(c.a),
    choices: [
      { label: "1", ok: firstRight },
      { label: "2", ok: !firstRight },
    ],
    fb: (ok) => (ok ? t("ear_ok") : t("ear_was", firstRight ? "1" : "2")),
    mark: (apis, ok) => (apis[firstRight ? 0 : 1] || apis[0]).events.forEach((e) => e._el && e._el.classList.add(ok ? "is-ok" : "is-hint")),
  };
}

function itemLabel(key) {
  const [, level, what] = key.split(":");
  return t("ex_ear_l" + level) + (level === "3" ? "" : " (" + what.replace(/(\+|-)/g, " $1").trim() + ")");
}

export default {
  id: "ear",
  prefix: "ear",
  kind: "quiz",
  levels: LEVELS,
  thr: 6000,
  lengths: [8, 16],
  lengthLabel: "qLenL",
  needsAudio: true,
  lessons: ["innerHearing"],
  question,
  itemLabel,
};
