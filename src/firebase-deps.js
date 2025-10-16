const firebaseAppUrl = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
const firebaseAuthUrl = "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const firebaseFirestoreUrl = "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function loadFirebaseDeps() {
  const [appModule, authModule, firestoreModule] = await Promise.all([
    import(firebaseAppUrl),
    import(firebaseAuthUrl),
    import(firebaseFirestoreUrl),
  ]);

  const deps = {
    ...appModule,
    ...authModule,
    ...firestoreModule,
  };

  window.__deps = {
    ...(window.__deps || {}),
    ...deps,
  };
}

await loadFirebaseDeps();
