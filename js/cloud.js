// Google account through Firebase Auth.
//
// Sign-in goes to Google's page and back (OpenID Connect, an ID token returned in the URL
// fragment), then Firebase exchanges that token for its own session. This avoids Firebase's
// popup and redirect helpers, which load scripts from apis.google.com: the app keeps a CSP
// that only runs its own scripts, with Trusted Types enforced.
import { emit } from "./bus.js";
import { firebaseConfig, GOOGLE_CLIENT_ID } from "./firebase-config.js";

const SS_FLOW = "dp-google-signin"; // {state, nonce} of the sign-in in progress
const LS_HINT = "dp-account"; // set once signed in, so the SDK is only loaded for people who use it

/** Account state for the UI: status is "out", "busy" or "in". */
export const account = { status: "out", email: "", error: "" };
let fb = null; // {app, auth, api}
let loading = null;

function set(patch) {
  Object.assign(account, patch);
  emit("account", account);
}

/** Load the SDK and restore the saved session, once. */
async function load() {
  if (fb) return fb;
  if (!loading)
    loading = (async () => {
      const [appMod, api] = await Promise.all([
        import("./vendor/firebase/firebase-app.js"),
        import("./vendor/firebase/firebase-auth.js"),
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      // No popup/redirect resolver: nothing is loaded from Google besides API calls.
      const auth = api.initializeAuth(app, { persistence: [api.indexedDBLocalPersistence, api.browserLocalPersistence] });
      api.onAuthStateChanged(auth, (u) => {
        if (u) {
          localStorage.setItem(LS_HINT, "1");
          set({ status: "in", email: u.email || "", error: "" });
        } else if (account.status !== "busy") set({ status: "out", email: "" });
      });
      await auth.authStateReady();
      fb = { app, auth, api };
      return fb;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** Signed-in Firebase user, or null. */
export const currentUser = () => (fb && fb.auth.currentUser) || null;
/** Firebase app and the Auth module, for the sync code. */
export const firebase = () => load();

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
/** The address Google sends the user back to: this page, without index.html, query or fragment. */
const returnUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");

export const canSignIn = () => !!GOOGLE_CLIENT_ID;

/** Leave for Google's sign-in page; the app reloads when Google sends the user back. */
export function signIn() {
  if (!GOOGLE_CLIENT_ID) return set({ error: "noClient" });
  const state = randomToken(),
    nonce = randomToken();
  sessionStorage.setItem(SS_FLOW, JSON.stringify({ state, nonce }));
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: returnUrl(),
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    state,
    prompt: "select_account",
  });
  set({ status: "busy", error: "" });
  location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + q);
}

export async function signOut() {
  localStorage.removeItem(LS_HINT);
  set({ status: "out", email: "", error: "" });
  if (fb) await fb.api.signOut(fb.auth);
}

/** Finish a sign-in coming back from Google; returns true if the URL was a sign-in return. */
async function finishFromUrl() {
  if (!location.hash) return false;
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has("id_token") && !h.has("error")) return false;
  // Clean the address bar first: the token must not stay in the URL or the history.
  history.replaceState(null, "", location.pathname + location.search);
  let flow = null;
  try {
    flow = JSON.parse(sessionStorage.getItem(SS_FLOW));
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(SS_FLOW);
  if (!flow || h.get("state") !== flow.state) {
    set({ status: "out", error: "badState" });
    return true;
  }
  if (h.has("error")) {
    set({ status: "out", error: h.get("error") === "access_denied" ? "cancelled" : "google" });
    return true;
  }
  set({ status: "busy", error: "" });
  try {
    const { auth, api } = await load();
    await api.signInWithCredential(auth, api.GoogleAuthProvider.credential(h.get("id_token")));
  } catch (e) {
    console.error(e);
    set({ status: "out", error: "firebase" });
  }
  return true;
}

/** Call once at startup. */
export async function initCloud() {
  if (await finishFromUrl()) return;
  if (!localStorage.getItem(LS_HINT)) return;
  set({ status: "busy" });
  try {
    await load();
    if (!fb.auth.currentUser) set({ status: "out" });
  } catch (e) {
    console.error(e);
    set({ status: "out", error: "offline" });
  }
}
