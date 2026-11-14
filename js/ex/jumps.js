// Blind jumps: find a note far away without looking, using the black keys as landmarks.
import { t } from "../i18n.js";
import { midiOf, intervalOf, rnd, pickOne } from "../theory.js";
import { pickByWeight, pitchLabel } from "../exercises.js";
import { choicesOf, grandSeq, spellMidi, dirKey, dirWord } from "./common.js";

const LEVELS = [{ nums: [8] }, { nums: [6, 7] }, { nums: [15] }];

function question(level, p, prev) {
  const L = LEVELS[level - 1];
  const cands = [];
  for (let i = 0; i < 12; i++) {
    const num = pickOne(L.nums),
      dir = pickOne([1, -1]);
    const span = (num - 1) * dir;
    let a;
    do a = 19 + rnd(20); // G2 … E5
    while (a + span < 15 || a + span > 43);
    const A = { dn: a, acc: 0 },
      B = { dn: a + span, acc: 0 },
      iv = intervalOf(A, B);
    const item = "jump:" + iv.number + iv.quality + ":" + dirKey(dir);
    if (!prev || item !== prev.item || i > 10) cands.push({ item, A, B, iv });
  }
  const c = pickByWeight(cands, 1500);
  const ma = midiOf(c.A),
    mb = midiOf(c.B);
  const wrongTargets = [-2, -1, 1, 2].map((d) => pitchLabel({ dn: c.B.dn + d, acc: 0 }));
  return {
    item: c.item,
    sc: grandSeq([c.A, c.B]),
    maxW: 320,
    label: pitchLabel(c.A) + " → " + pitchLabel(c.B),
    prompt: t("jump_prompt", pitchLabel(c.A), pitchLabel(c.B)),
    promptChoices: t("jump_ask", pitchLabel(c.A)),
    hint: t("jump_hint", t("ivName", c.iv.number, c.iv.quality), dirWord(c.iv.dir)),
    expect: { kind: "seq", notes: [{ midi: ma }, { midi: mb }] },
    msFromFirst: true,
    judge: (got) => ({ ok: got[0] === ma && got[1] === mb, got }),
    choices: choicesOf(pitchLabel(c.B), wrongTargets),
    fb: (ok, d) => {
      if (ok) return t("jump_ok");
      if (d && d.got && d.got[0] !== ma) return t("jump_start", pitchLabel(c.A));
      if (d && d.got) return t("jump_miss", pitchLabel(spellMidi(d.got[1])), pitchLabel(c.B));
      return t("fbWas", pitchLabel(c.B));
    },
    mark: (apis, ok, d) =>
      apis[0].events.forEach((e) => {
        if (!e._el || e.hidden) return;
        const second = e.notes[0] && e.notes[0].dn === c.B.dn;
        e._el.classList.add(ok ? "is-ok" : second && d && d.got ? "is-bad" : "is-hint");
      }),
  };
}

function itemLabel(key) {
  const [, iv, dir] = key.split(":");
  const n = parseInt(iv, 10);
  return t("ivName", n, iv.replace(/^\d+/, "")) + " " + dirWord(dir === "up" ? 1 : -1);
}

export default {
  id: "jumps",
  prefix: "jump",
  kind: "quiz",
  levels: LEVELS,
  thr: 1500,
  lengths: [10, 20],
  lengthLabel: "qLenL",
  lessons: ["blackKeys"],
  buttonsHint: "jump_buttonsH",
  question,
  itemLabel,
};
