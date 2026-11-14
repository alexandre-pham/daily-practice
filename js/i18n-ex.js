// Texts of the reading exercises, French first, merged into the app's translations.
import { I18N } from "./i18n.js";

const IV_FR = ["", "unisson", "seconde", "tierce", "quarte", "quinte", "sixte", "septième", "octave"];
const IV_EN = ["", "unison", "second", "third", "fourth", "fifth", "sixth", "seventh", "octave"];
const Q_FR = { P: "juste", M: "majeure", m: "mineure", A: "augmentée", d: "diminuée" };
const Q_EN = { P: "perfect", M: "major", m: "minor", A: "augmented", d: "diminished" };
const ivFr = (n, q) => {
  if (n === 1) return "unisson";
  const base = n <= 8 ? IV_FR[n] : n + "ᵉ";
  return q ? base + " " + Q_FR[q] : base;
};
const ivEn = (n, q) => {
  if (n === 1) return "unison";
  const base = n <= 8 ? IV_EN[n] : n + "th";
  return q ? Q_EN[q] + " " + base : base;
};

const FR = {
  // path and panes
  pathT: "Parcours",
  pathIntro: "Des exercices courts pour lire par formes, par blocs et en rythme, plutôt que note par note.",
  ex_notes_d: "Nommer chaque note, de plus en plus vite.",
  notesSeen: (n) => n + " notes travaillées",
  notSeen: "Pas encore commencé",
  levelOf: (l, n) => "Niveau " + l + "/" + n,
  levelN: (l) => "Niveau " + l,
  levelL: "Niveau",
  levelPassed: (l) => "niveau " + l + " validé",
  passedWord: "validé",
  tryNext: (l) => "Validé : essaie le niveau " + l + ".",
  masteryAria: (p) => p + " des éléments acquis",
  exBack: "← Exercices",
  lessonsT: "Leçons",
  theoryT: "Théorie",
  needsMidi: "Cet exercice se joue sur le piano : branche-le et choisis « Au piano (MIDI) » ci-dessous (Chrome).",
  answerButtonsH: "Réponds avec les boutons. Avec un piano MIDI branché, choisis « Au piano (MIDI) » pour jouer les réponses.",
  qLenL: "Questions par série",
  int_ask: "Quel intervalle ?",
  int_askC: "Quel motif ?",
  keys_ask: "Quelle tonalité majeure ?",
  keys_askMinor: "Quel relatif mineur ?",
  continue: "Continuer",
  skipped: "Passé.",
  fbBad: "Pas tout à fait.",
  fbWas: (x) => "C'était : " + x,
  fbWasPlain: "C'était :",
  fbShape: "Bonne forme, mais pas les bonnes notes : c'était",
  toReview: "À revoir",
  doneTimeQ: (s) => s + " s en moyenne par réponse juste",
  contL: "de continuité",
  contShort: (p) => p + " de continuité",
  notesPct: (p) => p + " % de notes justes",
  timingPct: (p) => p + " % en place",
  // intervals
  ivName: ivFr,
  harmonicW: "harmonique",
  ex_intervals: "Intervalles",
  ex_intervals_d: "Lire la distance entre les notes, pas chaque nom.",
  ex_intervals_i: "Deux notes, ou un petit motif : joue-les en lisant la distance et la direction depuis la première.",
  ex_intervals_l1: "Répétée, seconde ou tierce, sur les touches blanches.",
  ex_intervals_l2: "De la seconde à la quinte.",
  ex_intervals_l3: "Jusqu'à l'octave.",
  ex_intervals_l4: "Dans une tonalité : l'armure s'applique.",
  ex_intervals_l5: "Harmoniques : les deux notes ensemble.",
  ex_intervals_l6: "Motifs de 3 à 5 notes, par pas et par sauts.",
  int_prompt: "Joue les deux notes.",
  int_promptH: "Joue les deux notes ensemble.",
  int_promptC: "Joue tout le motif.",
  // keys
  ex_keys: "Armures",
  ex_keys_d: "Reconnaître la tonalité d'un coup d'œil.",
  ex_keys_i: "Une armure s'affiche : trouve la tonalité et joue sa tonique (ou sa gamme).",
  ex_keys_l1: "Jusqu'à 2 dièses ou 2 bémols : joue la tonique majeure.",
  ex_keys_l2: "Jusqu'à 4 altérations.",
  ex_keys_l3: "Les 15 tonalités.",
  ex_keys_l4: "Joue la tonique du relatif mineur.",
  ex_keys_l5: "Joue la gamme majeure sur une octave, en montant puis en descendant.",
  keys_prompt: "Quelle tonalité majeure ? Joue sa tonique.",
  keys_promptMinor: "Quel relatif mineur ? Joue sa tonique.",
  keys_promptScale: "Joue la gamme majeure, en montant puis en descendant.",
  keys_scaleHint: "N'importe quelle octave pour commencer.",
  keys_scaleButtons: "Sans piano : choisis la tonalité.",
  keyMajor: (n) => n + " majeur",
  keyMinor: (n) => n + " mineur",
  keySigAria: (n, sharp) => (n ? n + (sharp ? " dièse" : " bémol") + (n > 1 ? "s" : "") : "Sans altération"),
  noAccidentals: "aucune altération",
  scaleMissAt: (i) => "Erreur à la note " + i + ".",
  scaleOf: (k) => "Gamme de " + k,
};

const EN = {
  pathT: "Path",
  pathIntro: "Short exercises to read by shapes, blocks and rhythm, rather than note by note.",
  ex_notes_d: "Name each note, faster and faster.",
  notesSeen: (n) => n + " notes practised",
  notSeen: "Not started yet",
  levelOf: (l, n) => "Level " + l + "/" + n,
  levelN: (l) => "Level " + l,
  levelL: "Level",
  levelPassed: (l) => "level " + l + " passed",
  passedWord: "passed",
  tryNext: (l) => "Passed: try level " + l + ".",
  masteryAria: (p) => p + " of the items learned",
  exBack: "← Exercises",
  lessonsT: "Lessons",
  theoryT: "Theory",
  needsMidi: "This exercise is played on the piano: connect it and choose “On the piano (MIDI)” below (Chrome).",
  answerButtonsH: "Answer with the buttons. With a MIDI piano connected, choose “On the piano (MIDI)” to play the answers.",
  qLenL: "Questions per round",
  int_ask: "Which interval?",
  int_askC: "Which pattern?",
  keys_ask: "Which major key?",
  keys_askMinor: "Which relative minor?",
  continue: "Continue",
  skipped: "Skipped.",
  fbBad: "Not quite.",
  fbWas: (x) => "It was: " + x,
  fbWasPlain: "It was:",
  fbShape: "Right shape, wrong notes: it was",
  toReview: "To review",
  doneTimeQ: (s) => s + " s on average per right answer",
  contL: "continuity",
  contShort: (p) => p + " continuity",
  notesPct: (p) => p + "% right notes",
  timingPct: (p) => p + "% in time",
  ivName: ivEn,
  harmonicW: "harmonic",
  ex_intervals: "Intervals",
  ex_intervals_d: "Read the distance between notes, not every name.",
  ex_intervals_i: "Two notes, or a short pattern: play them by reading the distance and direction from the first one.",
  ex_intervals_l1: "Repeat, second or third, on white keys.",
  ex_intervals_l2: "Second to fifth.",
  ex_intervals_l3: "Up to the octave.",
  ex_intervals_l4: "In a key: the key signature applies.",
  ex_intervals_l5: "Harmonic: both notes together.",
  ex_intervals_l6: "Patterns of 3 to 5 notes, by steps and skips.",
  int_prompt: "Play both notes.",
  int_promptH: "Play both notes together.",
  int_promptC: "Play the whole pattern.",
  ex_keys: "Key signatures",
  ex_keys_d: "Recognise the key at a glance.",
  ex_keys_i: "A key signature appears: find the key and play its tonic (or its scale).",
  ex_keys_l1: "Up to 2 sharps or 2 flats: play the major tonic.",
  ex_keys_l2: "Up to 4 accidentals.",
  ex_keys_l3: "All 15 keys.",
  ex_keys_l4: "Play the tonic of the relative minor.",
  ex_keys_l5: "Play the major scale over one octave, up then down.",
  keys_prompt: "Which major key? Play its tonic.",
  keys_promptMinor: "Which relative minor? Play its tonic.",
  keys_promptScale: "Play the major scale, up then down.",
  keys_scaleHint: "Start in any octave.",
  keys_scaleButtons: "Without a piano: choose the key.",
  keyMajor: (n) => n + " major",
  keyMinor: (n) => n + " minor",
  keySigAria: (n, sharp) => (n ? n + (sharp ? " sharp" : " flat") + (n > 1 ? "s" : "") : "No accidentals"),
  noAccidentals: "no accidentals",
  scaleMissAt: (i) => "Mistake at note " + i + ".",
  scaleOf: (k) => k + " scale",
};

/** Add exercise texts (later modules call this with their own). */
export function addTexts(fr, en) {
  Object.assign(I18N.fr, fr);
  Object.assign(I18N.en, en);
}
addTexts(FR, EN);
