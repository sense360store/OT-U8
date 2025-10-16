const deps = window.__deps;

if (!deps || typeof deps !== "object") {
  throw new Error("Required dependencies are missing. Ensure window.__deps is defined before loading bootstrap.js.");
}

const firebaseConfig = window.__FIREBASE_CONFIG;

if (!firebaseConfig || typeof firebaseConfig !== "object") {
  throw new Error("Firebase config is missing. Set window.__FIREBASE_CONFIG before loading the app.");
}

const firebaseDeps = deps.firebase;
const fullCalendarDeps = deps.FullCalendar;

if (!firebaseDeps || typeof firebaseDeps.initializeApp !== "function") {
  throw new Error("Firebase dependencies are unavailable. Check the CDN loader script.");
}

if (!fullCalendarDeps || typeof fullCalendarDeps.Calendar !== "function") {
  throw new Error("FullCalendar dependency is unavailable. Check the CDN loader script.");
}

const { initializeApp } = firebaseDeps;
const authApi = firebaseDeps.auth;
const firestoreApi = firebaseDeps.firestore;

if (!authApi || typeof authApi.getAuth !== "function") {
  throw new Error("Firebase Auth dependency is unavailable.");
}

if (!firestoreApi || typeof firestoreApi.getFirestore !== "function") {
  throw new Error("Firebase Firestore dependency is unavailable.");
}

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = authApi.getAuth(firebaseApp);
const googleProvider = new authApi.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const firestoreDb = firestoreApi.getFirestore(firebaseApp);

window.App = window.App || {};
window.App.deps = deps;
window.App.firebase = {
  app: firebaseApp,
  auth: firebaseAuth,
  db: firestoreDb,
  googleProvider,
};

const [uiModule, _authModule, _dataModelModule, calendarModule] = await Promise.all([
  import("./ui.js"),
  import("./auth.js"),
  import("./dataModel.js"),
  import("./calendar.js"),
]);

const { initCalendar } = calendarModule;

const renderSelectedEvent = (event) => {
  window.App?.ui?.renderEventDetails?.(event);
};

document.addEventListener("DOMContentLoaded", () => {
  if (typeof initCalendar === "function") {
    try {
      initCalendar({
        onSelect: renderSelectedEvent,
      });
    } catch (error) {
      console.error("Failed to initialise calendar", error);
    }
  }

  if (typeof uiModule?.initUI === "function") {
    uiModule.initUI({
      onGoogleSignIn: () => window.App?.auth?.signInWithGoogle?.(),
      onEmailSignIn: (email, password) => window.App?.auth?.signInWithEmail?.(email, password),
      onRegister: (email, password, suggestedName) =>
        window.App?.auth?.registerWithEmail?.(email, password, suggestedName),
      onResetPassword: (email) => window.App?.auth?.sendReset?.(email),
      onSignOut: () => window.App?.auth?.signOutUser?.(),
    });
  }
});

console.info("Bootstrap complete: Firebase and FullCalendar initialised.");

await Promise.all([
  import("./access.js"),
  import("./rsvp.js"),
  import("./manage.js"),
  import("./app.js"),
  import("./main.js"),
]);
