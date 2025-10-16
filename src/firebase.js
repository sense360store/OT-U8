import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = window.__FIREBASE_CONFIG;

if (!firebaseConfig) {
  throw new Error("Firebase config is missing. Set window.__FIREBASE_CONFIG in index.html.");
}

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const db = getFirestore(app);

window.App = window.App || {};
window.App.firebase = { app, auth, db, googleProvider };

export { app, auth, db, googleProvider };
