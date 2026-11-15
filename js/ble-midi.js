// Bluetooth MIDI (BLE MIDI) straight from the page, with Chrome's Web Bluetooth: an alternative
// to pairing the piano in the computer's settings (on a Mac, Audio MIDI Setup), which macOS
// forgets each time the piano is switched off.
//
// Browsers only open a Bluetooth chooser after a click, so the first connection always takes one
// click. Where Chrome can list devices it was allowed to use before (getDevices), the piano is
// reconnected on its own when the page opens and whenever it comes back after being switched off.
import { readJSON, writeJSON } from "./util.js";

const SERVICE = "03b80e5a-ede8-4b33-a751-6ce34ec4c700"; // MIDI over Bluetooth Low Energy
const CHARACTERISTIC = "7772e5db-3868-4112-a1a9-f2669d106bf3";
const LS_BLE = "suivi-ble-v1";

export const BLE_OK = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);

/** Bytes after the status byte for a MIDI message (system messages other than SysEx: none here). */
function dataLen(status) {
  const hi = status & 0xf0;
  if (hi === 0xc0 || hi === 0xd0) return 1;
  if (hi >= 0x80 && hi <= 0xe0) return 2;
  if (status === 0xf1 || status === 0xf3) return 1;
  if (status === 0xf2) return 2;
  return 0;
}

/**
 * Split one BLE MIDI packet into MIDI messages. The packet is a header byte, then messages each
 * preceded by a timestamp byte (both with the top bit set); a message may reuse the previous
 * status ("running status"), with or without its own timestamp byte. SysEx is skipped.
 */
export function parseBleMidi(bytes, onMessage) {
  const b = bytes;
  if (!b || b.length < 2 || !(b[0] & 0x80)) return;
  let i = 1,
    status = 0;
  while (i < b.length) {
    if (b[i] & 0x80) {
      // a timestamp byte, then a status byte or running-status data
      i++;
      if (i >= b.length) break;
      if (b[i] & 0x80) {
        status = b[i];
        i++;
        if (status === 0xf0) {
          while (i < b.length && b[i] !== 0xf7) i++;
          i++;
          status = 0;
          continue;
        }
      }
    }
    if (!status) {
      i++;
      continue;
    }
    const n = dataLen(status);
    if (i + n > b.length) break;
    const msg = new Uint8Array(1 + n);
    msg[0] = status;
    for (let k = 0; k < n; k++) msg[1 + k] = b[i + k];
    i += n;
    onMessage(msg);
    if (status >= 0xf0) status = 0; // system messages don't set a running status
  }
}

// ---------- connection ----------
const ble = { device: null, char: null, connected: false, wanted: false, onMessage: null, onChange: null, retry: 0 };
export const bleConnected = () => ble.connected;
export const bleName = () => (ble.device && ble.device.name) || "Bluetooth";

/** Hooks: each MIDI message received, and each change of the connection state. */
export function setBleHandlers(onMessage, onChange) {
  ble.onMessage = onMessage;
  ble.onChange = onChange;
}
const changed = () => ble.onChange && ble.onChange();

function onValue(e) {
  const v = e.target.value;
  parseBleMidi(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), (msg) => ble.onMessage && ble.onMessage(msg));
}

async function open(device) {
  ble.device = device;
  if (!device._suiviListening) {
    device.addEventListener("gattserverdisconnected", () => {
      ble.connected = false;
      ble.char = null;
      changed();
      if (ble.wanted) reconnectLater();
    });
    device._suiviListening = true;
  }
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE);
  const ch = await service.getCharacteristic(CHARACTERISTIC);
  await ch.startNotifications();
  ch.addEventListener("characteristicvaluechanged", onValue);
  ble.char = ch;
  ble.connected = true;
  ble.wanted = true;
  ble.retry = 0;
  writeJSON(LS_BLE, { id: device.id, name: device.name || "" });
  changed();
}

/** Ask the user to choose the piano in Chrome's Bluetooth window (needs a click), then connect. */
export async function connectBle() {
  if (!BLE_OK) return false;
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }, { namePrefix: "KAWAI" }, { namePrefix: "CA" }],
      optionalServices: [SERVICE],
    });
    await open(device);
    return true;
  } catch (err) {
    changed();
    return err && err.name === "NotFoundError" ? false : Promise.reject(err);
  }
}

export function disconnectBle() {
  ble.wanted = false;
  if (ble.device && ble.device.gatt.connected) ble.device.gatt.disconnect();
  ble.connected = false;
  writeJSON(LS_BLE, {});
  changed();
}

/** After the piano was switched off: wait until it is seen again, then reconnect. */
function reconnectLater() {
  const d = ble.device;
  if (!d) return;
  if (d.watchAdvertisements) {
    const seen = () => {
      d.removeEventListener("advertisementreceived", seen);
      open(d).catch(() => reconnectLater());
    };
    d.addEventListener("advertisementreceived", seen);
    d.watchAdvertisements().catch(() => retryTimer());
  } else retryTimer();
}
function retryTimer() {
  ble.retry = Math.min(ble.retry + 1, 6);
  setTimeout(() => {
    if (ble.wanted && !ble.connected && ble.device) open(ble.device).catch(() => retryTimer());
  }, 2000 * ble.retry);
}

/** When the page opens: reconnect the piano chosen before, if Chrome remembers it. */
export async function restoreBle() {
  if (!BLE_OK || !navigator.bluetooth.getDevices) return;
  const saved = readJSON(LS_BLE, {});
  if (!saved || !saved.id) return;
  try {
    const list = await navigator.bluetooth.getDevices();
    const d = list.find((x) => x.id === saved.id);
    if (!d) return;
    ble.device = d;
    ble.wanted = true;
    await open(d).catch(() => reconnectLater());
  } catch {
    /* not allowed here: the button still works */
  }
}
