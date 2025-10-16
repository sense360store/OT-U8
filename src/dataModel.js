import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  where,
  addDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const { db } = window.App.firebase;

const collectionRefs = {
  events: collection(db, "events"),
  rsvps: collection(db, "rsvps"),
  roles: collection(db, "roles"),
};

function handleError(error) {
  console.error(error);
  window.App?.ui?.showToast(error.message || "Firestore error", { tone: "error" });
}

function listenToEvents(callback) {
  const q = query(collectionRefs.events, orderBy("start"));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(events);
    },
    handleError
  );
  return unsubscribe;
}

function listenToRsvps(eventId, callback) {
  if (!eventId) {
    return () => {};
  }
  const q = query(collectionRefs.rsvps, where("eventId", "==", eventId));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const rsvps = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(rsvps);
    },
    handleError
  );
  return unsubscribe;
}

async function saveMyRsvp(eventId, user, status) {
  if (!eventId) {
    throw new Error("No event selected");
  }
  if (!user) {
    throw new Error("You must be signed in to RSVP");
  }
  const allowed = ["yes", "no", "maybe"];
  if (!allowed.includes(status)) {
    throw new Error("Invalid RSVP status");
  }
  const docId = `${eventId}_${user.uid}`;
  const coachName = user.displayName || user.email || "Coach";
  const payload = {
    rsvpId: docId,
    eventId,
    uid: user.uid,
    coachName,
    status,
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, "rsvps", docId), payload, { merge: true });
    window.App?.rsvp?.cacheUserStatus?.(eventId, user.uid, status);
    return payload;
  } catch (error) {
    handleError(error);
    throw error;
  }
}

async function getMyRsvp(eventId, uid) {
  if (!eventId || !uid) {
    return null;
  }
  try {
    const docRef = doc(db, "rsvps", `${eventId}_${uid}`);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    handleError(error);
    throw error;
  }
}

async function checkIfAdmin(uid) {
  if (!uid) {
    return false;
  }
  try {
    const roleDoc = await getDoc(doc(collectionRefs.roles, uid));
    return roleDoc.exists() && roleDoc.data().role === "admin";
  } catch (error) {
    console.warn("Unable to verify admin role", error);
    return false;
  }
}

async function createEvent(data) {
  const payload = {
    title: data.title,
    start: data.start,
    end: data.end,
    location: data.location || "",
    notes: data.notes || "",
    createdBy: data.createdBy,
  };
  return addDoc(collectionRefs.events, payload);
}

window.App = window.App || {};
window.App.dataModel = {
  listenToEvents,
  listenToRsvps,
  saveMyRsvp,
  getMyRsvp,
  checkIfAdmin,
  createEvent,
};

export {
  listenToEvents,
  listenToRsvps,
  saveMyRsvp,
  getMyRsvp,
  checkIfAdmin,
  createEvent,
};
