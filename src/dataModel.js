import {
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
  updateDoc,
  deleteDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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
  const createdBy = currentUser?.uid || data.createdBy;
  const payload = {
    title: data.title,
    location: data.location || "",
    notes: data.notes || "",
    createdBy,
    createdAt: serverTimestamp(),
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

async function updateEvent(eventId, patch, currentUser) {
  if (!eventId) {
    throw new Error("Event ID is required");
  }
  if (!patch || typeof patch !== "object") {
    throw new Error("Update data is required");
  }

  const payload = { ...patch };

  if (Object.prototype.hasOwnProperty.call(payload, "start")) {
    if (payload.start === null || payload.start === "") {
      payload.start = null;
    } else if (payload.start) {
      payload.start = toUtcTimestamp(payload.start);
    } else {
      delete payload.start;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "end")) {
    if (payload.end === null || payload.end === "") {
      payload.end = null;
    } else if (payload.end) {
      payload.end = toUtcTimestamp(payload.end);
    } else {
      delete payload.end;
    }
  }

  payload.updatedAt = serverTimestamp();
  if (currentUser?.uid) {
    payload.updatedBy = currentUser.uid;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return updateDoc(doc(collectionRefs.events, eventId), payload);
}

async function deleteEvent(eventId) {
  if (!eventId) {
    throw new Error("Event ID is required");
  }
  return deleteDoc(doc(collectionRefs.events, eventId));
}

function isAdmin(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (typeof user.role === "string" && user.role.toLowerCase() === "admin") {
    return true;
  }
  if (Array.isArray(user.roles) && user.roles.includes("admin")) {
    return true;
  }
  if (user.claims?.admin || user.customClaims?.admin) {
    return true;
  }
  return false;
}

function canEditEvent(event, user) {
  if (!event || !user) return false;
  if (isAdmin(user)) return true;
  return event.createdBy && event.createdBy === user.uid;
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
  isAdmin,
  canEditEvent,
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
  isAdmin,
  canEditEvent,
};
