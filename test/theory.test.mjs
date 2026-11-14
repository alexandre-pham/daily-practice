import assert from "node:assert/strict";
import * as T from "../js/theory.js";
const N = ["Do","Ré","Mi","Fa","Sol","La","Si"];
const name = (n) => T.nameOf(N, T.letterOf(n.dn), n.acc);
// keys
assert.deepEqual(T.tonic(3), { letter: 5, acc: 0 }); // A major
assert.deepEqual(T.tonic(3, true), { letter: 3, acc: 1 }); // F# minor
assert.deepEqual(T.tonic(-3), { letter: 2, acc: -1 }); // Eb
assert.deepEqual(T.tonic(7), { letter: 0, acc: 1 }); // C#
assert.deepEqual(T.tonic(-7), { letter: 0, acc: -1 }); // Cb
assert.equal(T.fifthsOf(5, 0), 3);
assert.equal(T.fifthsOf(3, 1, true), 3);
assert.deepEqual(T.scaleOf(3).map(name), ["La","Si","Do♯","Ré","Mi","Fa♯","Sol♯"]);
assert.deepEqual(T.scaleOf(-1).map(name), ["Fa","Sol","La","Si♭","Do","Ré","Mi"]);
assert.deepEqual(T.signature(2).map(s=>N[s.letter]), ["Fa","Do"]);
// intervals
const iv = (a, b) => { const r = T.intervalOf(a, b); return r.number + r.quality + r.dir; };
assert.equal(iv({dn:28,acc:0},{dn:30,acc:0}), "3M1");
assert.equal(iv({dn:30,acc:0},{dn:28,acc:0}), "3M-1");
assert.equal(iv({dn:29,acc:0},{dn:31,acc:0}), "3m1"); // D-F
assert.equal(iv({dn:28,acc:0},{dn:35,acc:0}), "8P1");
assert.equal(iv({dn:31,acc:0},{dn:34,acc:0}), "4A1"); // F-B
assert.equal(iv({dn:34,acc:0},{dn:38,acc:0}), "5d1"); // B-F
assert.equal(iv({dn:28,acc:0},{dn:33,acc:0}), "6M1");
assert.equal(iv({dn:30,acc:0},{dn:35,acc:0}), "6m1");
assert.equal(iv({dn:29,acc:0},{dn:35,acc:0}), "7m1");
assert.equal(iv({dn:28,acc:0},{dn:28,acc:0}).slice(0,2), "1P");
assert.equal(iv({dn:28,acc:0},{dn:42,acc:0}), "15P1");
// chords
const ch = T.chordOf({dn:24,acc:1}, "min"); // F#m
assert.deepEqual(ch.map(name), ["Fa♯","La","Do♯"]);
assert.equal(T.qualityOf(ch), "min");
assert.deepEqual(T.chordOf({dn:30,acc:0},"dom7").map(name), ["Mi","Sol♯","Si","Ré"]);
assert.deepEqual(T.chordOf({dn:34,acc:0},"dim").map(name), ["Si","Ré","Fa"]);
assert.deepEqual(T.chordOnDegree(3, 4, T.degreeRoot(3,4,28)).map(name), ["Ré","Fa♯","La"]);
assert.equal(T.chordSymbol(N, {dn:24,acc:1}, "min"), "Fa♯m");
assert.equal(T.chordSymbol(N, {dn:29,acc:0}, "maj", {dn:31,acc:1}), "Ré/Fa♯");
assert.deepEqual(T.invert(T.chordOf({dn:28,acc:0},"maj"),1).map(n=>n.dn), [30,32,35]);
assert.deepEqual(T.pcSet([60,64,67,72]), [0,4,7]);
assert.equal(T.degreeOf(3, 1), 4); // D in A major is IV
for (let f = -7; f <= 7; f++) { const s = T.scaleOf(f); for (let i=0;i<7;i++){ const iv2=T.intervalOf(s[0], s[i]); assert.ok(["P","M"].includes(iv2.quality), f+" "+i);} }
console.log("theory ok");
