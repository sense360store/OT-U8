const {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} = window.__deps || {};

if (
  !onAuthStateChanged ||
  !signInWithPopup ||
  !signInWithEmailAndPassword ||
  !createUserWithEmailAndPassword ||
  !sendPasswordResetEmail ||
  !updateProfile ||
  !signOut
) {
  throw new Error(
    "Firebase auth dependencies are missing. Ensure firebase-deps script is loaded before auth.js."
  );
}

const { auth, googleProvider } = window.App.firebase;

function withToast(promise) {
  return promise.catch((error) => {
    console.error(error);
    const message = error?.message || "Something went wrong";
    window.App?.ui?.showToast(message, { tone: "error" });
    throw error;
  });
}

function signInWithGoogle() {
  return withToast(signInWithPopup(auth, googleProvider));
}

function signInWithEmail(email, password) {
  return withToast(signInWithEmailAndPassword(auth, email, password));
}

async function registerWithEmail(email, password, displayName) {
  const credential = await withToast(createUserWithEmailAndPassword(auth, email, password));
  if (displayName) {
    await updateProfile(credential.user, { displayName }).catch((error) => {
      console.warn("Unable to update profile", error);
    });
  }
  return credential;
}

function sendReset(email) {
  if (!email) {
    window.App?.ui?.showToast("Enter your email first", { tone: "info" });
    return Promise.resolve();
  }
  return withToast(sendPasswordResetEmail(auth, email));
}

function signOutUser() {
  return withToast(signOut(auth));
}

function listenToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

window.App = window.App || {};
window.App.auth = {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  sendReset,
  signOutUser,
  listenToAuth,
};

export { signInWithGoogle, signInWithEmail, registerWithEmail, sendReset, signOutUser, listenToAuth };
