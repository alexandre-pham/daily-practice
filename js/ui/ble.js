// The "Connect the piano via Bluetooth" control, shown wherever answers can come from the piano.
import { el } from "../util.js";
import { t } from "../i18n.js";
import { BLE_OK, bleConnected, connectBle, disconnectBle } from "../ble-midi.js";

/** A button to connect or disconnect the piano over Bluetooth, and a line for errors. */
export function bleControl(rerender) {
  if (!BLE_OK) return null;
  const box = el("div", "blectl");
  const b = el("button", "btn2", t(bleConnected() ? "bleDisconnect" : "bleConnect"));
  b.type = "button";
  const msg = el("p", "muted small blemsg", bleConnected() ? "" : t("bleHint"));
  b.addEventListener("click", async () => {
    if (bleConnected()) {
      disconnectBle();
      return rerender && rerender();
    }
    b.disabled = true;
    try {
      await connectBle();
    } catch {
      msg.textContent = t("bleFailed");
      b.disabled = false;
      return;
    }
    if (rerender) rerender();
  });
  box.append(b, msg);
  return box;
}
