// Sync with a secret GitHub gist. The token is stored only in this browser.
import { readJSON, writeJSON } from "./util.js";
import { emit, on } from "./bus.js";
import { state, normalize, merge, canon, payload, setData } from "./store.js";
import { fmt } from "./i18n.js";

const API = "https://api.github.com";
const FILE = "suivi-piano.json";
const LS_CFG = "suivi-piano-gist";
const PUSH_DELAY_MS = 2500;

const cfg = Object.assign({ token: "", gistId: "" }, readJSON(LS_CFG, {}));
const saveCfg = () => writeJSON(LS_CFG, cfg);

export const isConnected = () => !!cfg.token;
export const gistUrl = () => "https://gist.github.com/" + encodeURIComponent(cfg.gistId);

/** Last status, kept so the UI can re-render it after a language change. */
export let status = { state: "", key: "notConnected", args: [] };
function setStatus(st, key, ...args) {
  status = { state: st, key, args };
  emit("sync", status);
}

async function gh(path, opts = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: "Bearer " + cfg.token,
  };
  if (opts.body) headers["Content-Type"] = "application/json";
  const r = await fetch(API + path, { method: opts.method || "GET", headers, body: opts.body, cache: "no-store" });
  if (r.status === 401) throw { kind: "token" };
  if (r.status === 403 || r.status === 429) throw { kind: "limit" };
  if (r.status === 404) throw { kind: "notfound" };
  if (!r.ok) throw { kind: "http", status: r.status };
  return r.status === 204 ? null : r.json();
}

async function findOrCreateGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh("/gists?per_page=100&page=" + page);
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  const g = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({ description: "Practice tracker data", public: false, files: { [FILE]: { content: payload() } } }),
  });
  return g.id;
}

async function readGist() {
  const g = await gh("/gists/" + cfg.gistId);
  const f = g.files && g.files[FILE];
  if (!f) return { acts: {}, entries: {} };
  let text = f.content;
  if (f.truncated) text = await (await fetch(f.raw_url, { cache: "no-store" })).text();
  try {
    return normalize(JSON.parse(text));
  } catch {
    return { acts: {}, entries: {} };
  }
}

async function doSync() {
  setStatus("busy", "syncing");
  try {
    if (!cfg.gistId) {
      cfg.gistId = await findOrCreateGist();
      saveCfg();
    }
    let remote;
    try {
      remote = await readGist();
    } catch (e) {
      if (e.kind !== "notfound") throw e;
      cfg.gistId = await findOrCreateGist();
      saveCfg();
      remote = await readGist();
    }
    const merged = merge(state.data, remote);
    if (canon(merged) !== canon(state.data)) {
      setData(merged);
      emit("data");
    }
    if (canon(merged) !== canon(remote)) {
      await gh("/gists/" + cfg.gistId, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content: payload() } } }) });
    }
    setStatus("ok", "syncOk", fmt.time.format(new Date()));
  } catch (e) {
    if (e && e.kind === "token") setStatus("err", "errToken");
    else if (e && e.kind === "limit") setStatus("err", "errLimit");
    else if (!navigator.onLine) setStatus("err", "errOffline");
    else setStatus("err", "errSync");
  }
}

let chain = Promise.resolve();
/** Run a sync, serialised so two syncs never overlap. */
export function sync() {
  if (!cfg.token) return Promise.resolve();
  chain = chain.then(doSync, doSync);
  return chain;
}

let pushTimer;
on("changed", () => {
  clearTimeout(pushTimer);
  if (cfg.token) pushTimer = setTimeout(sync, PUSH_DELAY_MS);
});

export async function connect(token) {
  cfg.token = token;
  cfg.gistId = "";
  saveCfg();
  await sync();
  if (status.key === "errToken") {
    cfg.token = "";
    saveCfg();
    setStatus("err", "tokenRefused");
    return false;
  }
  return true;
}

export function disconnect() {
  cfg.token = "";
  cfg.gistId = "";
  saveCfg();
  setStatus("", "disconnected");
}

export function initSync() {
  if (!cfg.token) setStatus("", "notConnected");
  window.addEventListener("online", sync);
  sync();
}
