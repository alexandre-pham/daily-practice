// Firebase project of the app. None of this is secret: access to the data is
// controlled by the Firestore and Storage security rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDiBZfPLaWf2NFFy7Qhl_92CzwQuXcbzjw",
  authDomain: "acp-piano-practice.firebaseapp.com",
  projectId: "acp-piano-practice",
  storageBucket: "acp-piano-practice.firebasestorage.app",
  messagingSenderId: "307396284827",
  appId: "1:307396284827:web:85e2410ad090fe9b7a513e",
};

// OAuth web client used for "Sign in with Google" (Google Cloud console → APIs & Services →
// Credentials → "Web client (auto created by Google Service)"). Its authorized redirect URIs
// must include the exact address of the app, for example https://alexandre-pham.github.io/daily-practice/
export const GOOGLE_CLIENT_ID = "";
