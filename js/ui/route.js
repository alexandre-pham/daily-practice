// Where the app is, kept in the page address: #sessions, #stats, #reading, #reading/pieces,
// #recordings. After a refresh the app reopens the same tab and the same exercise page, the
// browser's back button moves between them, and an exercise can be bookmarked.
import { state } from "../store.js";

const VIEWS = { sess: "sessions", stats: "stats", read: "reading", recs: "recordings" };
const BACK = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [v, k]));
let hooks = { getSel: () => "", setSel: () => {} };
let applying = false;

/** The Reading tab tells the router which exercise page is open. */
export function setRouteHooks(h) {
  hooks = h;
}

/** Read the address: set the tab and the exercise page it names (call before rendering). */
export function readRoute() {
  const [view, sel] = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
  if (!BACK[view]) return false;
  applying = true;
  state.view = BACK[view];
  hooks.setSel(view === "reading" && sel && /^[a-z0-9-]{1,20}$/.test(sel) ? sel : "");
  applying = false;
  return true;
}

/** Write the address after a change of tab or exercise page; a new place is a new history step. */
export function writeRoute() {
  if (applying || !VIEWS[state.view]) return;
  const sel = state.view === "read" ? hooks.getSel() : "";
  const hash = "#" + VIEWS[state.view] + (sel ? "/" + sel : "");
  if (location.hash === hash) return;
  if (!location.hash) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
}
