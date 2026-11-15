// BLE MIDI packet parsing (run with: node test/ble.test.mjs)
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { parseBleMidi } = await import("../js/ble-midi.js");
const parse = (arr) => {
  const out = [];
  parseBleMidi(Uint8Array.from(arr), (m) => out.push([...m]));
  return out;
};
// one note on
assert.deepEqual(parse([0x80, 0x80, 0x90, 60, 100]), [[0x90, 60, 100]]);
// two messages, each with a timestamp
assert.deepEqual(parse([0x80, 0x81, 0x90, 60, 100, 0x82, 0x80, 60, 0]), [[0x90, 60, 100], [0x80, 60, 0]]);
// running status without timestamp (a chord)
assert.deepEqual(parse([0x80, 0x80, 0x90, 60, 90, 64, 90, 67, 90]), [[0x90, 60, 90], [0x90, 64, 90], [0x90, 67, 90]]);
// running status with a new timestamp
assert.deepEqual(parse([0x80, 0x80, 0x90, 60, 90, 0x85, 62, 90]), [[0x90, 60, 90], [0x90, 62, 90]]);
// sustain pedal, then a note; active sensing in between
assert.deepEqual(parse([0x80, 0x80, 0xb0, 64, 127, 0x81, 0xfe, 0x82, 0x90, 72, 80]), [[0xb0, 64, 127], [0xfe], [0x90, 72, 80]]);
// sysex skipped
assert.deepEqual(parse([0x80, 0x80, 0xf0, 1, 2, 3, 0xf7, 0x81, 0x90, 48, 70]), [[0x90, 48, 70]]);
// malformed: not a BLE MIDI header
assert.deepEqual(parse([0x10, 0x90, 60, 100]), []);
console.log("ble ok");
