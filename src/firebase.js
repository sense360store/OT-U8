import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const config = window.__FIREBASE_CONFIG;
if (!config) {
  throw new Error("Firebase config is missing. Set window.__FIREBASE_CONFIG in index.html.");
}

const firebaseApp = initializeApp(config);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Failed to set auth persistence", error);
});

const db = getFirestore(firebaseApp);

window.App = window.App || {};
window.App.firebase = {
  app: firebaseApp,
  auth,
  db,
  googleProvider,
};

export { firebaseApp as app, auth, db, googleProvider };
