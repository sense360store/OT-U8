import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const { db } = window.App.firebase;

async function evaluateAccess(user) {
  if (!user?.uid) {
    return { allowed: false, role: null, requested: false };
  }

  const uid = user.uid;
  const result = { allowed: false, role: null, requested: false };

  try {
    const roleDoc = await getDoc(doc(db, "roles", uid));
    if (roleDoc.exists()) {
      const role = roleDoc.data()?.role || null;
      return { allowed: true, role, requested: false };
    }

    const requestDoc = await getDoc(doc(db, "access_requests", uid));
    if (requestDoc.exists()) {
      result.requested = true;
    }
  } catch (error) {
    console.warn("Unable to evaluate access", error);
  }

  return result;
}

async function requestAccess(user, notes = "") {
  if (!user?.uid) {
    throw new Error("You must be signed in to request access.");
  }

  const payload = {
    email: user.email || "",
    displayName: user.displayName || "",
    requestedAt: serverTimestamp(),
  };

  const trimmedNotes = notes.trim();
  if (trimmedNotes) {
    payload.notes = trimmedNotes;
  }

  await setDoc(doc(db, "access_requests", user.uid), payload);
}

window.App = window.App || {};
window.App.access = {
  evaluateAccess,
  requestAccess,
};

export { evaluateAccess, requestAccess };
