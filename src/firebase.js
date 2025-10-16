const firebaseGlobals = window.App?.firebase;

if (!firebaseGlobals) {
  throw new Error("Firebase has not been initialised. Load bootstrap.js first.");
}

const { app, auth, db, googleProvider } = firebaseGlobals;

export { app, auth, db, googleProvider };
