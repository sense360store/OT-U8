const RSVP_STATUSES = [
  { value: "yes", label: "Yes", icon: "✅" },
  { value: "maybe", label: "Maybe", icon: "❔" },
  { value: "no", label: "No", icon: "❌" },
];

const userStatusCache = new Map();

function getCacheKey(eventId, uid) {
  if (!eventId || !uid) return null;
  return `${eventId}__${uid}`;
}

function cacheUserStatus(eventId, uid, status) {
  const key = getCacheKey(eventId, uid);
  if (!key) return;
  userStatusCache.set(key, status || null);
}

function getCachedUserStatus(eventId, uid) {
  const key = getCacheKey(eventId, uid);
  if (!key) return undefined;
  if (!userStatusCache.has(key)) {
    return undefined;
  }
  return userStatusCache.get(key);
}

function groupByStatus(rsvps = []) {
  return RSVP_STATUSES.reduce((acc, status) => {
    acc[status.value] = rsvps.filter((item) => item.status === status.value);
    return acc;
  }, {});
}

function getUserStatus(rsvps = [], uid, eventId) {
  if (!uid) return null;
  const match = rsvps.find((rsvp) => rsvp.uid === uid);
  if (match) {
    cacheUserStatus(eventId, uid, match.status);
    return match.status;
  }
  if (eventId) {
    const cached = getCachedUserStatus(eventId, uid);
    return typeof cached === "undefined" ? null : cached;
  }
  return null;
}

async function loadUserStatus(eventId, uid) {
  if (!eventId || !uid) {
    return null;
  }
  const cached = getCachedUserStatus(eventId, uid);
  if (typeof cached !== "undefined") {
    return cached;
  }
  try {
    const rsvp = await window.App.dataModel.getMyRsvp(eventId, uid);
    const status = rsvp?.status || null;
    cacheUserStatus(eventId, uid, status);
    return status;
  } catch (error) {
    console.error(error);
    window.App?.ui?.showToast?.("Unable to load RSVP", { tone: "error" });
    throw error;
  }
}

window.App = window.App || {};
window.App.rsvp = {
  RSVP_STATUSES,
  groupByStatus,
  getUserStatus,
  loadUserStatus,
  cacheUserStatus,
};

export { RSVP_STATUSES, groupByStatus, getUserStatus, loadUserStatus };
