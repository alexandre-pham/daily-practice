// Short theory lessons, linked from the exercises and listed under "Théorie" in the Reading tab.
// Each lesson: {id, title: {fr, en}, blocks: [{type: "p" | "list" | "staff", …}]}. Text is French
// first; examples are drawn with js/ui/score.js. Rendered with DOM calls (see js/ui/exhome.js).
const N = (dn, acc = 0) => ({ dn, acc });
const q = (notes, d = 1, extra = {}) => Object.assign({ d, notes: Array.isArray(notes) ? notes : [notes] }, extra);
const one = (clef, key, events, time) => ({ staves: [{ clef }], key, time, voices: [{ staff: 0, events }] });

export const LESSONS = [
  {
    id: "intervals",
    title: { fr: "Lire par intervalles", en: "Reading by intervals" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Un bon lecteur ne nomme pas chaque note. Il lit la première, puis la distance et la direction jusqu'à la suivante : « une tierce plus haut », « une seconde plus bas ». La main suit cette forme sans décoder.",
          en: "A good reader doesn't name every note. They read the first one, then the distance and direction to the next: “a third up”, “a second down”. The hand follows that shape without decoding.",
        },
      },
      {
        type: "p",
        text: {
          fr: "On compte les notes en incluant les deux bouts : de Do à Mi, Do-Ré-Mi, c'est une tierce. De Do à Sol, une quinte. De Do au Do suivant, une octave.",
          en: "Count the notes including both ends: from C to E, C-D-E, is a third. From C to G, a fifth. From C to the next C, an octave.",
        },
      },
      { type: "staff", score: one("t", 0, [q(N(28)), q(N(29)), q(N(28)), q(N(30)), q(N(28)), q(N(32)), q(N(28)), q(N(35))]), caption: { fr: "Seconde, tierce, quinte, octave depuis Do", en: "Second, third, fifth, octave from C" }, opts: { even: true, gap: 40 } },
      {
        type: "p",
        text: {
          fr: "Dans l'exercice, nomme ou joue la première note, puis fais confiance à la distance pour la seconde.",
          en: "In the exercise, find the first note, then trust the distance for the second.",
        },
      },
    ],
  },
  {
    id: "staffSteps",
    title: { fr: "Les intervalles sur la portée", en: "Intervals on the staff" },
    blocks: [
      {
        type: "list",
        items: [
          { fr: "Ligne → interligne voisin (ou l'inverse) : une seconde, un pas.", en: "Line → next space (or the reverse): a second, a step." },
          { fr: "Ligne → ligne suivante, ou interligne → interligne : une tierce, un saut.", en: "Line → next line, or space → next space: a third, a skip." },
          { fr: "Ligne → ligne en sautant une ligne : une quinte.", en: "Line → line, skipping one line: a fifth." },
          { fr: "Une ligne et un interligne à l'autre bout : une octave a toujours une note sur une ligne et l'autre dans un interligne.", en: "An octave always has one note on a line and the other in a space." },
        ],
      },
      { type: "staff", score: one("t", 0, [q(N(30)), q(N(31)), q(N(30)), q(N(32)), q(N(30)), q(N(34)), q(N(30)), q(N(37))]), caption: { fr: "Mi : seconde, tierce, quinte, octave", en: "E: second, third, fifth, octave" }, opts: { even: true, gap: 40 } },
      {
        type: "p",
        text: {
          fr: "Avec l'habitude, l'œil voit « ligne-ligne » ou « ligne-interligne » avant même de lire les notes.",
          en: "With practice, the eye sees “line-line” or “line-space” before reading the notes at all.",
        },
      },
    ],
  },
  {
    id: "keySigs",
    title: { fr: "Les armures", en: "Key signatures" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "L'armure, au début de chaque ligne, dit quelles notes sont altérées pour tout le morceau. Lire « trois dièses, donc La majeur » vaut mieux que repérer chaque fa♯ un par un.",
          en: "The key signature at the start of each line says which notes are altered for the whole piece. Reading “three sharps, so A major” beats spotting every F♯ one by one.",
        },
      },
      {
        type: "list",
        items: [
          { fr: "Dièses, toujours dans l'ordre : fa, do, sol, ré, la, mi, si. La tonique majeure est un demi-ton au-dessus du dernier dièse.", en: "Sharps always come in order: F C G D A E B. The major tonic is a semitone above the last sharp." },
          { fr: "Bémols, dans l'ordre inverse : si, mi, la, ré, sol, do, fa. La tonique majeure est l'avant-dernier bémol (un bémol : Fa majeur).", en: "Flats in the reverse order: B E A D G C F. The major tonic is the second-to-last flat (one flat: F major)." },
        ],
      },
      { type: "staff", score: one("t", 3, []), caption: { fr: "Trois dièses : La majeur (ou Fa♯ mineur)", en: "Three sharps: A major (or F♯ minor)" }, opts: { width: 200 } },
    ],
  },
  {
    id: "relMinor",
    title: { fr: "Majeur et relatif mineur", en: "Major and relative minor" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Chaque armure sert à deux tonalités : une majeure et sa relative mineure, une tierce mineure plus bas (le 6ᵉ degré). Do majeur et La mineur n'ont aucune altération ; La majeur et Fa♯ mineur ont trois dièses.",
          en: "Each key signature serves two keys: a major one and its relative minor, a minor third lower (the 6th degree). C major and A minor have no accidentals; A major and F♯ minor have three sharps.",
        },
      },
      {
        type: "p",
        text: {
          fr: "Pour savoir lequel des deux, regarde la première et la dernière note de la basse, et cherche la sensible : en La mineur, des sol♯ apparaissent dans la musique.",
          en: "To tell which one, look at the first and last bass notes, and for the leading note: in A minor, G♯s appear in the music.",
        },
      },
    ],
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);
export function addLessons(list) {
  for (const l of list) if (!lessonById(l.id)) LESSONS.push(l);
}
