const {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
  addDoc,
  Timestamp,
} = window.__deps || {};

if (
  !collection ||
  !query ||
  !orderBy ||
  !onSnapshot ||
  !doc ||
  !getDoc ||
  !setDoc ||
  !updateDoc ||
  !deleteDoc ||
  !serverTimestamp ||
  !where ||
  !addDoc ||
  !Timestamp
) {
  throw new Error(
    "Firestore dependencies are missing. Ensure firebase-deps script is loaded before dataModel.js."
  );
}

const { db } = window.App.firebase;

const collectionRefs = {
  events: collection(db, "events"),
  rsvps: collection(db, "rsvps"),
  roles: collection(db, "roles"),
  accessRequests: collection(db, "access_requests"),
  allowlist: collection(db, "allowlist"),
};

function handleError(error) {
  console.error(error);
  window.App?.ui?.showToast(error.message || "Firestore error", { tone: "error" });
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toUtcTimestamp(value) {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value");
  }
  return Timestamp.fromDate(date);
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
      const rsvps = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .map((item) => ({
          ...item,
          coachName: item.coachName || "Coach",
        }))
        .sort((a, b) => {
          const aName = a.coachName?.toLowerCase?.() || "";
          const bName = b.coachName?.toLowerCase?.() || "";
          if (aName === bName) {
            return (a.uid || "").localeCompare(b.uid || "");
          }
          return aName.localeCompare(bName);
        });
      callback(rsvps);
    },
    handleError
  );
  return unsubscribe;
}

function listenUpcomingEvents(callback) {
  const now = Timestamp.now();
  const q = query(
    collectionRefs.events,
    where("end", ">=", now),
    orderBy("end"),
    orderBy("start")
  );
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => toMillis(a.start) - toMillis(b.start));
      callback(events);
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

async function createEvent(data, currentUser) {
  if (!currentUser?.uid && !data?.createdBy) {
    throw new Error("You must be signed in to create events");
  }
  const payload = {
    title: data.title,
    location: data.location || "",
    notes: data.notes || "",
    createdBy: data.createdBy,
    updatedAt: serverTimestamp(),
  };

  if (data.start !== undefined && data.start !== null && data.start !== "") {
    payload.start = toUtcTimestamp(data.start);
  }
  if (data.end !== undefined && data.end !== null && data.end !== "") {
    payload.end = toUtcTimestamp(data.end);
  }
  return addDoc(collectionRefs.events, payload);
}

async function updateEvent(eventId, updates) {
  if (!eventId) {
    throw new Error("Missing event id");
  }
  const docRef = doc(collectionRefs.events, eventId);
  const payload = {
    ...sanitizeEventPayload(updates),
    updatedAt: serverTimestamp(),
  };
  try {
    await updateDoc(docRef, payload);
  } catch (error) {
    handleError(error);
    throw error;
  }
}

async function deleteEvent(eventId) {
  if (!eventId) {
    throw new Error("Missing event id");
  }
  try {
    await deleteDoc(doc(collectionRefs.events, eventId));
  } catch (error) {
    handleError(error);
    throw error;
  }
}

function sanitizeEventPayload(data = {}) {
  const result = {};
  if (typeof data.title === "string") {
    result.title = data.title;
  }
  if (data.start instanceof Date || typeof data.start?.toDate === "function" || data.start === null) {
    result.start = data.start;
  }
  if (data.end instanceof Date || typeof data.end?.toDate === "function" || data.end === null) {
    result.end = data.end;
  }
  if (typeof data.location === "string") {
    result.location = data.location;
  }
  if (typeof data.notes === "string") {
    result.notes = data.notes;
  }
  if (data.createdBy) {
    result.createdBy = data.createdBy;
  }
  return result;
}

window.App = window.App || {};
window.App.dataModel = {
  listenToEvents,
  listenUpcomingEvents,
  listenToRsvps,
  saveMyRsvp,
  getMyRsvp,
  checkIfAdmin,
  createEvent,
  updateEvent,
  deleteEvent,
};

export {
  listenToEvents,
  listenUpcomingEvents,
  listenToRsvps,
  saveMyRsvp,
  getMyRsvp,
  checkIfAdmin,
  createEvent,
  updateEvent,
  deleteEvent,
};
