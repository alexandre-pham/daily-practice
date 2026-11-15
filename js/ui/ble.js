// The piano connection, for the whole app: the "Piano" section of the settings (status, connect
// or disconnect over Bluetooth, whether to offer the connection at start-up), and the window that
// offers to connect the piano each time the app opens without it.
//
// Browsers only open their Bluetooth chooser after a click, so the app can't connect the piano on
// its own the first time: it asks, and one click on "Connect" opens Chrome's window.
import { $, el, readJSON, writeJSON } from "../util.js";
import { on } from "../bus.js";
import { t } from "../i18n.js";
import { midiStatusKey, ensureMidi, MIDI_OK } from "../recorder.js";
import { BLE_OK, bleConnected, connectBle, disconnectBle } from "../ble-midi.js";
import { lockScroll } from "./dialogs.js";

const LS_ASK = "suivi-ble-ask-v1";
const askOnStart = () => readJSON(LS_ASK, { ask: true }).ask !== false;
const setAsk = (v) => writeJSON(LS_ASK, { ask: !!v });

function chip(label, pressed, fn) {
  const b = el("button", "chip", label);
  b.type = "button";
  b.setAttribute("aria-pressed", String(pressed));
  b.addEventListener("click", fn);
  return b;
}

/** The "Piano" section of the settings. */
export function renderPianoSettings() {
  const box = $("pianoSet");
  if (!box) return;
  box.textContent = "";
  const s = midiStatusKey();
  const line = el("div", "syncline");
  const dot = el("span", "sdot" + (s && s.key === "pianoIs" ? " ok" : ""));
  line.append(dot, el("span", "", s && s.key === "pianoIs" ? t(s.key, ...s.args) : t("pianoNone")));
  line.lastChild.setAttribute("role", "status");
  box.appendChild(line);
  if (!BLE_OK) {
    box.appendChild(el("p", "muted small help", t(MIDI_OK ? "pianoUsbOnly" : "pianoNoMidi")));
    return;
  }
  const btns = el("div", "btns mt0");
  const b = el("button", "btn2", t(bleConnected() ? "bleDisconnect" : "bleConnect"));
  b.type = "button";
  const err = el("p", "dlg-err hide");
  err.setAttribute("role", "alert");
  b.addEventListener("click", async () => {
    if (bleConnected()) return disconnectBle();
    b.disabled = true;
    try {
      await connectBle();
    } catch {
      err.textContent = t("bleFailed");
      err.classList.remove("hide");
    }
    b.disabled = false;
    renderPianoSettings();
  });
  btns.appendChild(b);
  box.appendChild(btns);
  box.appendChild(err);
  box.appendChild(el("p", "muted small help", t("pianoHelp")));
  const ask = askOnStart();
  const row = el("div", "chips");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", t("bleAskL"));
  row.append(
    chip(t("yes"), ask, () => (setAsk(true), renderPianoSettings())),
    chip(t("no"), !ask, () => (setAsk(false), renderPianoSettings())),
  );
  box.append(el("div", "rlab mt10", t("bleAskL")), row);
}

// ---------- the start-up window ----------
let returnFocus = null;
function openAsk() {
  returnFocus = document.activeElement;
  $("bleAskErr").classList.add("hide");
  $("bleAsk").classList.remove("hide");
  lockScroll();
  $("bleAskGo").focus();
}
function closeAsk() {
  if ($("bleAsk").classList.contains("hide")) return false;
  $("bleAsk").classList.add("hide");
  lockScroll();
  if (returnFocus && returnFocus.focus) returnFocus.focus();
  return true;
}

/** At start-up: offer to connect the piano if it isn't there (neither Bluetooth nor USB). */
async function maybeAsk() {
  if (!BLE_OK || !askOnStart() || bleConnected()) return;
  // A piano on USB counts too, but only check when MIDI was already allowed (no permission prompt).
  try {
    if (MIDI_OK && navigator.permissions) {
      const p = await navigator.permissions.query({ name: "midi" });
      if (p.state === "granted") {
        await ensureMidi();
        const s = midiStatusKey();
        if (s && s.key === "pianoIs") return;
      }
    }
  } catch {
    /* permissions API without "midi": ask anyway */
  }
  if (!bleConnected()) openAsk();
}

export function initBle() {
  renderPianoSettings();
  on("rec", renderPianoSettings);
  on("lang", renderPianoSettings);
  if (!BLE_OK) return;
  $("bleAskLater").addEventListener("click", closeAsk);
  $("bleAskGo").addEventListener("click", async () => {
    $("bleAskGo").disabled = true;
    try {
      const ok = await connectBle();
      $("bleAskGo").disabled = false;
      if (ok) closeAsk();
    } catch {
      $("bleAskGo").disabled = false;
      $("bleAskErr").textContent = t("bleFailed");
      $("bleAskErr").classList.remove("hide");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && closeAsk()) e.stopImmediatePropagation();
  });
  // Give the automatic reconnection (when Chrome remembers the piano) a moment first.
  setTimeout(maybeAsk, 1800);
}
