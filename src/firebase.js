const {
  initializeApp,
  getAuth,
  GoogleAuthProvider,
  getFirestore,
} = window.__deps || {};

if (!initializeApp || !getAuth || !GoogleAuthProvider || !getFirestore) {
  throw new Error(
    "Firebase dependencies are missing. Ensure firebase-deps script is loaded before firebase.js."
  );
}

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
