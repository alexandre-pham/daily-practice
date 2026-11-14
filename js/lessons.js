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
  {
    id: "buildChord",
    title: { fr: "Construire un accord : une note sur deux", en: "Building a chord: every other note" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Un accord de trois sons se construit en empilant une note sur deux de la gamme : on prend une note, on en saute une, on prend la suivante, on en saute une, on prend la suivante. Do – (ré) – Mi – (fa) – Sol : l'accord de Do.",
          en: "A three-note chord is built by stacking every other note of the scale: take a note, skip one, take the next, skip one, take the next. C – (D) – E – (F) – G: the C chord.",
        },
      },
      {
        type: "p",
        text: {
          fr: "Pas besoin d'apprendre une liste : la règle donne tous les accords. En La majeur (fa♯, do♯, sol♯) : La – Do♯ – Mi, Ré – Fa♯ – La, Mi – Sol♯ – Si, Fa♯ – La – Do♯.",
          en: "No list to learn: the rule gives every chord. In A major (F♯, C♯, G♯): A – C♯ – E, D – F♯ – A, E – G♯ – B, F♯ – A – C♯.",
        },
      },
      {
        type: "list",
        items: [
          { fr: "Majeur : tierce majeure puis tierce mineure (Do – Mi – Sol). Son clair.", en: "Major: major third then minor third (C – E – G). Bright sound." },
          { fr: "Mineur : tierce mineure puis tierce majeure (La – Do – Mi). Son plus sombre ; on l'écrit « Lam ».", en: "Minor: minor third then major third (A – C – E). Darker; written “Am”." },
          { fr: "Septième de dominante : un accord majeur plus une tierce mineure (Sol – Si – Ré – Fa), écrit « Sol7 ».", en: "Dominant seventh: a major chord plus a minor third (G – B – D – F), written “G7”." },
        ],
      },
    ],
  },
  {
    id: "chordShapes",
    title: { fr: "Accords sur la portée : trois lignes ou trois interlignes", en: "Chords on the staff: three lines or three spaces" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "En position fondamentale, un accord se voit d'un coup : trois notes sur trois lignes de suite, ou dans trois interlignes de suite, comme un bonhomme de neige. La note du bas donne son nom.",
          en: "In root position a chord is seen at once: three notes on three lines in a row, or in three spaces in a row, like a snowman. The bottom note names it.",
        },
      },
      {
        type: "staff",
        score: one("t", 0, [q([N(28), N(30), N(32)], 4), q([N(29), N(31), N(33)], 4), q([N(31), N(33), N(35)], 4)]),
        caption: { fr: "Do (lignes), Ré mineur (interlignes), Fa (interlignes)", en: "C (lines), D minor (spaces), F (spaces)" },
        opts: { even: true, gap: 60 },
      },
      {
        type: "p",
        text: {
          fr: "Les doigts gardent la même forme (1-3-5) : lis la note du bas, la main pose l'accord.",
          en: "The fingers keep the same shape (1-3-5): read the bottom note, the hand places the chord.",
        },
      },
    ],
  },
  {
    id: "inversions",
    title: { fr: "Les renversements", en: "Inversions" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Un accord garde son nom quand on change l'ordre des notes. Do – Mi – Sol, Mi – Sol – Do et Sol – Do – Mi sont tous l'accord de Do : position fondamentale, premier renversement, second renversement.",
          en: "A chord keeps its name when the notes change order. C – E – G, E – G – C and G – C – E are all the C chord: root position, first inversion, second inversion.",
        },
      },
      {
        type: "staff",
        score: one("t", 0, [q([N(28), N(30), N(32)], 4), q([N(30), N(32), N(35)], 4), q([N(32), N(35), N(37)], 4)]),
        caption: { fr: "Do : fondamental, 1ᵉʳ et 2ᵉ renversement", en: "C: root position, 1st and 2nd inversion" },
        opts: { even: true, gap: 60 },
      },
      {
        type: "p",
        text: {
          fr: "Repère l'intervalle de quarte (deux notes séparées par un interligne et une ligne) : la note du haut de la quarte est la fondamentale. Dans « Ré/Fa♯ », la note après la barre est la basse.",
          en: "Look for the fourth (two notes a line and a space apart): its upper note is the root. In “D/F♯”, the note after the slash is the bass.",
        },
      },
    ],
  },
  {
    id: "degrees",
    title: { fr: "Les degrés I, IV, V et vi", en: "Degrees I, IV, V and vi" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Dans une tonalité, on numérote les accords construits sur chaque note de la gamme : I sur la tonique, IV sur la quatrième note, V sur la cinquième. En chiffres romains : majuscules pour les accords majeurs, minuscules pour les mineurs.",
          en: "In a key, chords are numbered by the scale note they are built on: I on the tonic, IV on the fourth note, V on the fifth. Roman numerals: capitals for major chords, lower case for minor ones.",
        },
      },
      {
        type: "list",
        items: [
          { fr: "Majeurs : I, IV, V. Mineurs : ii, iii, vi. Diminué : vii°.", en: "Major: I, IV, V. Minor: ii, iii, vi. Diminished: vii°." },
          { fr: "En Do majeur : I = Do, IV = Fa, V = Sol, vi = La mineur.", en: "In C major: I = C, IV = F, V = G, vi = A minor." },
          { fr: "En La majeur : I = La, IV = Ré, V = Mi, vi = Fa♯ mineur.", en: "In A major: I = A, IV = D, V = E, vi = F♯ minor." },
        ],
      },
      {
        type: "p",
        text: {
          fr: "Penser en degrés permet de reconnaître le même enchaînement dans toutes les tonalités.",
          en: "Thinking in degrees lets you recognise the same sequence in every key.",
        },
      },
    ],
  },
  {
    id: "progressions",
    title: { fr: "Les progressions courantes", en: "Common progressions" },
    blocks: [
      {
        type: "list",
        items: [
          { fr: "I – IV – V – I : la cadence de base, partout en musique classique et populaire.", en: "I – IV – V – I: the basic cadence, everywhere in classical and popular music." },
          { fr: "I – V – vi – IV et vi – IV – I – V : les boucles de la pop (River Flows in You est en vi – IV – I – V).", en: "I – V – vi – IV and vi – IV – I – V: the pop loops (River Flows in You is vi – IV – I – V)." },
          { fr: "I – vi – IV – V : la progression « années 50 ».", en: "I – vi – IV – V: the “fifties” progression." },
          { fr: "ii – V – I : la cadence du jazz.", en: "ii – V – I: the jazz cadence." },
        ],
      },
      {
        type: "p",
        text: {
          fr: "Quand tu reconnais une boucle, tu ne lis plus la main gauche : tu vérifies seulement qu'elle continue. Joue-les chaque jour dans une nouvelle tonalité, sans partition, pour que les mains les connaissent.",
          en: "Once you recognise a loop, you stop reading the left hand: you only check that it carries on. Play them every day in a new key, without music, so your hands know them.",
        },
      },
    ],
  },
  {
    id: "tendency",
    title: { fr: "Notes attractives : la sensible monte vers la tonique", en: "Tendency notes: the leading note rises to the tonic" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Certaines notes appellent la suivante. La 7ᵉ note de la gamme (la sensible, sol♯ en La majeur) monte presque toujours vers la tonique. La 4ᵉ (ré en La majeur) descend volontiers vers la 3ᵉ. Dans un accord de septième, la septième descend d'un degré.",
          en: "Some notes pull towards the next one. The 7th note of the scale (the leading note, G♯ in A major) almost always rises to the tonic. The 4th (D in A major) tends to fall to the 3rd. In a seventh chord, the seventh falls by a step.",
        },
      },
      {
        type: "p",
        text: {
          fr: "C'est ce qui permet de deviner la note suivante : quand tu vois la sensible, attends-toi à la tonique.",
          en: "This is how you guess the next note: when you see the leading note, expect the tonic.",
        },
      },
    ],
  },
  {
    id: "blackKeys",
    title: { fr: "Jouer sans regarder les mains : les touches noires comme repères", en: "Playing without looking: black keys as landmarks" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Pour lire, les yeux doivent rester sur la partition. Les doigts trouvent leur chemin au toucher : les touches noires forment des groupes de deux et de trois qu'on sent sans les voir.",
          en: "To read, the eyes must stay on the music. The fingers find their way by touch: the black keys form groups of two and three you can feel without looking.",
        },
      },
      {
        type: "list",
        items: [
          { fr: "Do est juste à gauche du groupe de deux, Ré au milieu, Mi à droite.", en: "C is just left of the group of two, D in the middle, E to the right." },
          { fr: "Fa est juste à gauche du groupe de trois, Si juste à droite.", en: "F is just left of the group of three, B just right of it." },
          { fr: "Une octave, c'est une main bien ouverte : apprends la sensation de l'écart, pas la vue.", en: "An octave is an open hand: learn how the stretch feels, not how it looks." },
        ],
      },
      {
        type: "p",
        text: {
          fr: "Dans l'exercice, ferme les yeux pour le saut. Effleure les touches noires pour te repérer, puis joue.",
          en: "In the exercise, close your eyes for the jump. Brush the black keys to find your place, then play.",
        },
      },
    ],
  },
  {
    id: "innerHearing",
    title: { fr: "Entendre avant de jouer", en: "Hearing before playing" },
    blocks: [
      {
        type: "p",
        text: {
          fr: "Les bons lecteurs entendent la musique dans leur tête en la lisant. C'est un des meilleurs signes d'une bonne lecture, et cela se travaille.",
          en: "Good readers hear the music in their head as they read. It is one of the best signs of strong reading, and it can be trained.",
        },
      },
      {
        type: "list",
        items: [
          { fr: "Avant de jouer une nouvelle pièce, chante ou fredonne les premières mesures.", en: "Before playing a new piece, sing or hum the first bars." },
          { fr: "Pense « monte d'une tierce », « redescend d'un pas » : l'oreille suit les mêmes formes que l'œil.", en: "Think “up a third”, “down a step”: the ear follows the same shapes as the eye." },
          { fr: "Après avoir joué, compare ce que tu as entendu dans ta tête et ce qui est sorti du piano.", en: "After playing, compare what you heard in your head with what came out of the piano." },
        ],
      },
    ],
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);
export function addLessons(list) {
  for (const l of list) if (!lessonById(l.id)) LESSONS.push(l);
}
