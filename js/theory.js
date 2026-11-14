// Music theory for the reading exercises: spelled notes, keys, scales, intervals and chords.
// Pure functions, no DOM, so they can be tested with Node.
//
// A spelled note is {dn, acc}: the diatonic number used everywhere in the app (octave * 7 +
// letter, C = 0 … B = 6, middle C = 28) and an accidental from -2 (double flat) to +2.
// A key is its number of fifths: -7 (seven flats) … 0 (C major) … 7 (seven sharps).

export const SEMI = [0, 2, 4, 5, 7, 9, 11];
export const letterOf = (dn) => ((dn % 7) + 7) % 7;
export const octOf = (dn) => Math.floor(dn / 7);
export const midiOf = (n) => 12 * (octOf(n.dn) + 1) + SEMI[letterOf(n.dn)] + (n.acc || 0);
export const pcOf = (n) => ((midiOf(n) % 12) + 12) % 12;
export const same = (a, b) => a.dn === b.dn && (a.acc || 0) === (b.acc || 0);

/** Letters carrying an accidental in key signatures, in order. */
export const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
export const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** Accidental the key signature gives to a letter. */
export function keyAcc(fifths, letter) {
  if (fifths > 0) return SHARP_ORDER.indexOf(letter) < fifths && SHARP_ORDER.indexOf(letter) >= 0 ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.indexOf(letter) < -fifths ? -1 : 0;
  return 0;
}
/** The letters altered by a key signature, in signature order: [{letter, acc}]. */
export function signature(fifths) {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).map((letter) => ({ letter, acc: 1 }));
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).map((letter) => ({ letter, acc: -1 }));
  return [];
}

/** Tonic of a major key (minor: its relative minor) as {letter, acc}. */
export function tonic(fifths, minor = false) {
  const letter = (((fifths * 4) % 7) + 7 + (minor ? 5 : 0)) % 7;
  return { letter, acc: keyAcc(fifths, letter) };
}
/** Number of fifths of the major key on a tonic, or null if it isn't one of the 15 keys. */
export function fifthsOf(letter, acc, minor = false) {
  for (let f = -7; f <= 7; f++) {
    const t = tonic(f, minor);
    if (t.letter === letter && t.acc === acc) return f;
  }
  return null;
}

/** A note of a key: the letter with the key's accidental, in a given octave. */
export const inKey = (fifths, dn) => ({ dn, acc: keyAcc(fifths, letterOf(dn)) });

/** The seven notes of the major scale from the tonic at or above dn0 (or the minor natural scale). */
export function scaleOf(fifths, dn0 = 28, minor = false) {
  const t = tonic(fifths, minor);
  let start = dn0 - letterOf(dn0) + t.letter;
  if (start < dn0) start += 7;
  const out = [];
  for (let i = 0; i < 7; i++) out.push(inKey(fifths, start + i));
  return out;
}
/** Scale degree (1–7) of a letter in a major key. */
export const degreeOf = (fifths, letter) => ((letter - tonic(fifths).letter + 7) % 7) + 1;

// ---------- intervals ----------
const PERFECT = { 1: 0, 4: 5, 5: 7, 8: 12 };
const MAJOR = { 2: 2, 3: 4, 6: 9, 7: 11 };

/**
 * Interval from a to b: {number 1–8 (larger intervals keep counting: 9, 10…), quality, dir, semis}.
 * quality: "P" perfect, "M" major, "m" minor, "A" augmented, "d" diminished.
 */
export function intervalOf(a, b) {
  const dir = Math.sign(b.dn - a.dn) || Math.sign(midiOf(b) - midiOf(a)),
    lo = dir < 0 ? b : a,
    hi = dir < 0 ? a : b,
    number = hi.dn - lo.dn + 1,
    semis = midiOf(hi) - midiOf(lo);
  const simple = ((number - 1) % 7) + 1,
    perfect = simple in PERFECT,
    d = semis - 12 * Math.floor((number - 1) / 7) - (perfect ? PERFECT[simple] : MAJOR[simple]);
  const quality = perfect ? (d === 0 ? "P" : d > 0 ? "A" : "d") : d === 0 ? "M" : d === -1 ? "m" : d > 0 ? "A" : "d";
  return { number, quality, dir, semis };
}

/** The note an interval above (dir 1) or below (dir -1) a note, spelled inside a key. */
export const stepInKey = (fifths, n, number, dir) => inKey(fifths, n.dn + dir * (number - 1));

// ---------- chords ----------
export const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
/** Quality of each triad of the major scale. */
export const DEGREE_QUALITY = ["maj", "min", "min", "maj", "maj", "min", "dim"];

/** Triad (or seventh chord) on a degree of a major key, root position from the root at dn. */
export function chordOnDegree(fifths, degree, dn, seventh = false) {
  const root = inKey(fifths, dn);
  const out = [root, inKey(fifths, dn + 2), inKey(fifths, dn + 4)];
  if (seventh) out.push(inKey(fifths, dn + 6));
  return out;
}
/** Root dn of a degree at or above dn0. */
export function degreeRoot(fifths, degree, dn0) {
  const L = (tonic(fifths).letter + degree - 1) % 7;
  let dn = dn0 - letterOf(dn0) + L;
  if (dn < dn0) dn += 7;
  return dn;
}

/** A chord of a given quality on a spelled root: maj, min, dim, aug, dom7. */
export function chordOf(root, quality) {
  const third = { dn: root.dn + 2 },
    fifth = { dn: root.dn + 4 };
  const want3 = quality === "maj" || quality === "aug" || quality === "dom7" ? 4 : 3,
    want5 = quality === "dim" ? 6 : quality === "aug" ? 8 : 7;
  third.acc = want3 - (midiOf({ dn: third.dn, acc: 0 }) - midiOf(root));
  fifth.acc = want5 - (midiOf({ dn: fifth.dn, acc: 0 }) - midiOf(root));
  const out = [root, third, fifth];
  if (quality === "dom7") {
    const sev = { dn: root.dn + 6 };
    sev.acc = 10 - (midiOf({ dn: sev.dn, acc: 0 }) - midiOf(root));
    out.push(sev);
  }
  return out;
}

/** Quality of three or four stacked notes in root position. */
export function qualityOf(notes) {
  const r = midiOf(notes[0]),
    a = midiOf(notes[1]) - r,
    b = midiOf(notes[2]) - r;
  let q = a === 4 && b === 7 ? "maj" : a === 3 && b === 7 ? "min" : a === 3 && b === 6 ? "dim" : a === 4 && b === 8 ? "aug" : "?";
  if (notes.length > 3) q = q === "maj" && midiOf(notes[3]) - r === 10 ? "dom7" : q + "7";
  return q;
}

/** Inversion: rotate the lowest notes up an octave (1 = first inversion, 2 = second). */
export function invert(notes, inv) {
  const out = notes.map((n) => ({ dn: n.dn, acc: n.acc }));
  for (let i = 0; i < inv; i++) {
    const n = out.shift();
    out.push({ dn: n.dn + 7, acc: n.acc });
  }
  return out;
}

export const pcSet = (notes) => [...new Set(notes.map((n) => (typeof n === "number" ? ((n % 12) + 12) % 12 : pcOf(n))))].sort((a, b) => a - b);
export const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Shift notes by octaves so the lowest sits at or above dn0. */
export function placeFrom(notes, dn0) {
  const low = Math.min(...notes.map((n) => n.dn));
  const k = Math.ceil((dn0 - low) / 7) * 7;
  return notes.map((n) => ({ dn: n.dn + k, acc: n.acc }));
}

// ---------- names ----------
const ACC = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };
export const accSign = (acc) => ACC[acc || 0];
/** Name of a letter with its accidental, with a table of 7 names (solfège or letters). */
export const nameOf = (names, letter, acc) => names[letter] + accSign(acc);
/** Chord symbol: "Fa♯m", "Ré", "Si°", "Mi7"; with an inversion, "/bass". */
export function chordSymbol(names, root, quality, bass) {
  const suf = { maj: "", min: "m", dim: "°", aug: "+", dom7: "7" }[quality] || "";
  let s = nameOf(names, letterOf(root.dn), root.acc) + suf;
  if (bass && letterOf(bass.dn) !== letterOf(root.dn)) s += "/" + nameOf(names, letterOf(bass.dn), bass.acc);
  return s;
}

// ---------- random helpers ----------
export const rnd = (n) => Math.floor(Math.random() * n);
export const pickOne = (list) => list[rnd(list.length)];
export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Weighted pick: items [{w}] → one item. */
export function pickWeighted(items) {
  let r = Math.random() * items.reduce((s, x) => s + x.w, 0);
  for (const x of items) if ((r -= x.w) <= 0) return x;
  return items[items.length - 1];
}
