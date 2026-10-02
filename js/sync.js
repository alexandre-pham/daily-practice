// Sync with a secret GitHub gist. The token is stored only in this browser, encrypted with the
// user's passphrase; the gist content is encrypted with the same passphrase.
import { readJSON, writeJSON } from "./util.js";
import { emit, on } from "./bus.js";
import { state, normalize, merge, canon, payload, setData } from "./store.js";
import { fmt } from "./i18n.js";
import { KDF_ITER, newSalt, deriveKey, encrypt, decrypt } from "./crypto.js";

const API = "https://api.github.com";
const FILE = "suivi-piano.json";
const LS_CFG = "suivi-piano-gist";
const PUSH_DELAY_MS = 2500;
export const PASS_MIN = 10;

// Stored: {gistId, salt, tokenBox: {iv, ct}, oldGistId?}. Older versions stored a plaintext `token`.
const cfg = Object.assign({ gistId: "", salt: "", tokenBox: null }, readJSON(LS_CFG, {}));
const saveCfg = () => writeJSON(LS_CFG, cfg);

// Unlocked secrets, kept in memory only: {token, pass, key, salt}.
let session = null;

export const isConnected = () => !!(cfg.tokenBox || cfg.token);
export const isLocked = () => isConnected() && !session;
export const hasLegacyToken = () => !!cfg.token;
export const gistUrl = () => "https://gist.github.com/" + encodeURIComponent(cfg.gistId);

/** Last status, kept so the UI can re-render it after a language change. */
export let status = { state: "", key: "notConnected", args: [] };
function setStatus(st, key, ...args) {
  status = { state: st, key, args };
  emit("sync", status);
}

// ---------- keys ----------
/** Key for a given salt, re-derived from the passphrase when another device changed the salt. */
async function keyFor(salt, iter = KDF_ITER) {
  if (session.key && session.salt === salt) return session.key;
  session.key = await deriveKey(session.pass, salt, iter);
  session.salt = salt;
  return session.key;
}
async function ensureKey() {
  return session.key || keyFor(cfg.salt || newSalt());
}
async function saveToken() {
  cfg.tokenBox = await encrypt(await ensureKey(), session.token);
  cfg.salt = session.salt;
  delete cfg.token;
  saveCfg();
}

// ---------- GitHub ----------
async function gh(path, opts = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: "Bearer " + session.token,
  };
  if (opts.body) headers["Content-Type"] = "application/json";
  const r = await fetch(API + path, { method: opts.method || "GET", headers, body: opts.body, cache: "no-store" });
  if (r.status === 401) throw { kind: "token" };
  if (r.status === 403 || r.status === 429) throw { kind: "limit" };
  if (r.status === 404) throw { kind: "notfound" };
  if (!r.ok) throw { kind: "http", status: r.status };
  return r.status === 204 ? null : r.json();
}

/** Gist file content: the data set, encrypted. */
async function sealed() {
  const box = await encrypt(await ensureKey(), payload());
  return JSON.stringify({ app: "suivi-piano", enc: 1, kdf: "PBKDF2-SHA256", iter: KDF_ITER, salt: session.salt, ...box });
}

async function createGist() {
  const g = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({ description: "Practice tracker data", public: false, files: { [FILE]: { content: await sealed() } } }),
  });
  return g.id;
}

async function findOrCreateGist() {
  for (let page = 1; page <= 10; page++) {
    const list = await gh("/gists?per_page=100&page=" + page);
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return createGist();
}

/** Delete the pre-encryption gist; kept in cfg so a failed attempt is retried on the next sync. */
async function dropOldGist() {
  try {
    await gh("/gists/" + cfg.oldGistId, { method: "DELETE" });
  } catch (e) {
    if (e.kind !== "notfound") throw { kind: "oldgist" };
  }
  delete cfg.oldGistId;
  saveCfg();
}

/** @returns {Promise<{data, encrypted: boolean, legacy?: boolean}>} */
async function readGist() {
  const empty = { data: { acts: {}, entries: {} }, encrypted: false };
  const g = await gh("/gists/" + cfg.gistId);
  const f = g.files && g.files[FILE];
  if (!f) return empty;
  let text = f.content;
  if (f.truncated) text = await (await fetch(f.raw_url, { cache: "no-store" })).text();
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!obj || obj.enc !== 1) {
    const alone = Object.keys(g.files).length === 1; // never delete a gist holding other files
    return { data: normalize(obj), encrypted: false, legacy: alone };
  }
  if (!Number.isInteger(obj.iter) || obj.iter < KDF_ITER || obj.iter > 10 * KDF_ITER) throw { kind: "pass" };
  let plain;
  try {
    plain = await decrypt(await keyFor(obj.salt, obj.iter), obj);
  } catch {
    throw { kind: "pass" };
  }
  return { data: normalize(JSON.parse(plain)), encrypted: true };
}

async function doSync() {
  if (!session) return;
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
    const merged = merge(state.data, remote.data);
    if (canon(merged) !== canon(state.data)) {
      setData(merged);
      emit("data");
    }
    if (remote.legacy) {
      // Gist history keeps every plaintext revision: move to a fresh gist, then delete the old one.
      cfg.oldGistId = cfg.gistId;
      cfg.gistId = await createGist();
      saveCfg();
    } else if (!remote.encrypted || canon(merged) !== canon(remote.data)) {
      await gh("/gists/" + cfg.gistId, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content: await sealed() } } }) });
    }
    if (!cfg.tokenBox || cfg.salt !== session.salt) await saveToken();
    if (cfg.oldGistId) await dropOldGist();
    setStatus("ok", "syncOk", fmt.time.format(new Date()));
  } catch (e) {
    if (e && e.kind === "token") setStatus("err", "errToken");
    else if (e && e.kind === "pass") setStatus("err", "errPass");
    else if (e && e.kind === "oldgist") setStatus("err", "errOldGist");
    else if (e && e.kind === "limit") setStatus("err", "errLimit");
    else if (!navigator.onLine) setStatus("err", "errOffline");
    else setStatus("err", "errSync");
  }
}

let chain = Promise.resolve();
/** Run a sync, serialised so two syncs never overlap. */
export function sync() {
  if (!session) return Promise.resolve();
  chain = chain.then(doSync, doSync);
  return chain;
}

let pushTimer;
on("changed", () => {
  clearTimeout(pushTimer);
  if (session) pushTimer = setTimeout(sync, PUSH_DELAY_MS);
});

/** Connect with a new token, or migrate a legacy plaintext token. Returns true on success. */
export async function connect(token, pass) {
  const legacy = !!cfg.token;
  session = { token, pass, key: null, salt: "" };
  if (!legacy) Object.assign(cfg, { gistId: "", salt: "", tokenBox: null });
  await sync();
  if (status.key === "errToken" || status.key === "errPass") {
    const key = status.key === "errToken" ? "tokenRefused" : "errPass";
    session = null;
    if (!legacy) Object.assign(cfg, { gistId: "", salt: "", tokenBox: null });
    saveCfg();
    setStatus("err", key);
    return false;
  }
  if (!cfg.tokenBox) await saveToken(); // e.g. offline: keep the token, encrypted, for the next sync
  return true;
}

/** Decrypt the stored token with the passphrase. Returns true on success. */
export async function unlock(pass) {
  if (cfg.token) return connect(cfg.token, pass);
  try {
    const key = await deriveKey(pass, cfg.salt);
    session = { token: await decrypt(key, cfg.tokenBox), pass, key, salt: cfg.salt };
  } catch {
    setStatus("err", "errPass");
    return false;
  }
  await sync();
  return true;
}

export function disconnect() {
  session = null;
  Object.assign(cfg, { gistId: "", salt: "", tokenBox: null });
  delete cfg.token;
  delete cfg.oldGistId;
  saveCfg();
  setStatus("", "disconnected");
}

export function initSync() {
  if (!isConnected()) setStatus("", "notConnected");
  else setStatus("busy", cfg.token ? "setPass" : "locked");
  window.addEventListener("online", sync);
}
