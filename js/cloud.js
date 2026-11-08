// Account through Firebase Auth, with email and password.
//
// Email/password sign-in only makes API calls to Google (identitytoolkit, securetoken):
// no popup, no redirect and no Google script in the page, so the app keeps a CSP that
// only runs its own scripts, with Trusted Types enforced. Accounts are created in the
// Firebase console; sign-up from the app is turned off in the project settings.
import { emit } from "./bus.js";
import { firebaseConfig } from "./firebase-config.js";

const LS_HINT = "dp-account"; // set once signed in, so the SDK is only loaded for people who use it

/** Account state for the UI: status is "out", "busy" or "in"; error is a key for the message. */
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

/** Message key for a Firebase Auth error code. */
function errorKey(e) {
  const code = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "badLogin";
  if (/invalid-email|missing-email/.test(code)) return "badEmail";
  if (/missing-password/.test(code)) return "noPass";
  if (/too-many-requests/.test(code)) return "tooMany";
  if (/network-request-failed/.test(code)) return "offline";
  if (/user-disabled/.test(code)) return "disabled";
  return "failed";
}

/** Sign in; resolves to true on success. Errors end up in account.error. */
export async function signIn(email, password) {
  set({ status: "busy", error: "" });
  try {
    const { auth, api } = await load();
    await api.signInWithEmailAndPassword(auth, email.trim(), password);
    return true;
  } catch (e) {
    set({ status: "out", error: errorKey(e) });
    return false;
  }
}

/** Email a password reset link; resolves to true if Firebase accepted the request. */
export async function resetPassword(email) {
  try {
    const { auth, api } = await load();
    await api.sendPasswordResetEmail(auth, email.trim());
    set({ error: "" });
    return true;
  } catch (e) {
    set({ error: errorKey(e) });
    return false;
  }
}

export async function signOut() {
  localStorage.removeItem(LS_HINT);
  set({ status: "out", email: "", error: "" });
  if (fb) await fb.api.signOut(fb.auth);
}

/** Call once at startup: restores the session if this device was signed in. */
export async function initCloud() {
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
