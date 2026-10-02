// Toasts, confirmation dialog, settings sheet and "new activity" modal.
import { $ } from "../util.js";
import { t } from "../i18n.js";

// ---------- toast ----------
let toastTimer,
  toastAction = null;

/**
 * Show a short message. With an action, a button is shown (e.g. Undo).
 * @param {string} msg
 * @param {{label?: string, onAction?: () => void, duration?: number}} [opts]
 */
export function toast(msg, opts = {}) {
  const box = $("toast"),
    btn = $("toastBtn");
  $("toastMsg").textContent = msg;
  toastAction = opts.onAction || null;
  btn.classList.toggle("hide", !toastAction);
  if (toastAction) btn.textContent = opts.label || t("undo");
  box.classList.remove("hide");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, opts.duration || 3000);
}
export function hideToast() {
  $("toast").classList.add("hide");
  toastAction = null;
}
export function initToast() {
  $("toastBtn").addEventListener("click", () => {
    const fn = toastAction;
    hideToast();
    if (fn) fn();
  });
}

// ---------- confirmation ----------
let resolveAsk = null,
  askReturnFocus = null;

/** Promise-based confirmation dialog; resolves true when confirmed. */
export function ask(title, body, label) {
  return new Promise((resolve) => {
    resolveAsk = resolve;
    askReturnFocus = document.activeElement;
    $("dTitle").textContent = title;
    $("dBody").textContent = body;
    $("dOk").textContent = label;
    $("dialog").classList.remove("hide");
    $("dKeep").focus();
  });
}
function closeAsk(value) {
  $("dialog").classList.add("hide");
  const r = resolveAsk;
  resolveAsk = null;
  if (askReturnFocus && askReturnFocus.focus) askReturnFocus.focus();
  if (r) r(value);
}

// ---------- settings sheet & new-activity modal ----------
export const isOpen = (id) => !$(id).classList.contains("hide");
function lockScroll() {
  const anyOverlay = isOpen("settings") || isOpen("newAct") || isOpen("focus");
  document.body.classList.toggle("noscroll", anyOverlay);
}
export function openSheet() {
  $("settings").classList.remove("hide");
  lockScroll();
  $("setClose").focus();
}
export function closeSheet() {
  $("settings").classList.add("hide");
  lockScroll();
  $("setBtn").focus();
}
export function openNewAct() {
  $("naName").value = "";
  $("naGoal").value = "210";
  $("newAct").classList.remove("hide");
  lockScroll();
  $("naName").focus();
}
export function closeNewAct() {
  $("newAct").classList.add("hide");
  lockScroll();
  $("actBtn").focus();
}
export { lockScroll };

export function initDialogs() {
  initToast();
  $("dKeep").addEventListener("click", () => closeAsk(false));
  $("dOk").addEventListener("click", () => closeAsk(true));
  $("setBg").addEventListener("click", closeSheet);
  $("setClose").addEventListener("click", closeSheet);
  $("naCancel").addEventListener("click", closeNewAct);
  $("newAct").addEventListener("click", (e) => {
    if (e.target === $("newAct")) closeNewAct();
  });
}

/** Close the top-most overlay; returns true if something was closed. */
export function closeTopOverlay() {
  if (isOpen("dialog")) {
    closeAsk(false);
    return true;
  }
  if (isOpen("newAct")) {
    closeNewAct();
    return true;
  }
  if (isOpen("settings")) {
    closeSheet();
    return true;
  }
  return false;
}
