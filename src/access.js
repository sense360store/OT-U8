import { doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const { db } = window.App.firebase;

const COLLECTIONS = {
  roles: "roles",
  allowlist: "allowlist",
};

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function deriveAccessState({ role = null, allowlisted = false }) {
  const isAdmin = role === "admin";
  const hasRoleAccess = role === "coach" || isAdmin;
  return {
    role,
    allowlisted,
    isAdmin,
    hasAccess: Boolean(allowlisted || hasRoleAccess),
  };
}

function subscribeToAccess(user, callback = () => {}) {
  const baseState = deriveAccessState({});
  callback({ ...baseState, isReady: false });

  if (!user) {
    return () => {};
  }

  let current = { ...baseState };
  let roleReady = false;
  const emailKey = normalizeEmail(user.email);
  let allowReady = !emailKey;

  const emit = () => {
    const computed = deriveAccessState(current);
    callback({ ...computed, isReady: roleReady && allowReady });
  };

  const unsubscribers = [];

  const roleRef = doc(db, COLLECTIONS.roles, user.uid);
  unsubscribers.push(
    onSnapshot(
      roleRef,
      (snapshot) => {
        current.role = snapshot.exists() ? snapshot.data()?.role || null : null;
        roleReady = true;
        emit();
      },
      (error) => {
        console.error("Role subscription failed", error);
        current.role = null;
        roleReady = true;
        emit();
      }
    )
  );

  if (emailKey) {
    const allowRef = doc(db, COLLECTIONS.allowlist, emailKey);
    unsubscribers.push(
      onSnapshot(
        allowRef,
        (snapshot) => {
          current.allowlisted = snapshot.exists();
          allowReady = true;
          emit();
        },
        (error) => {
          console.error("Allowlist subscription failed", error);
          current.allowlisted = false;
          allowReady = true;
          emit();
        }
      )
    );
  }

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
  };
}

async function getAccessSnapshot(user) {
  if (!user) {
    return deriveAccessState({});
  }

  const [roleDoc, allowDoc] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.roles, user.uid)).catch((error) => {
      console.warn("Unable to fetch role", error);
      return null;
    }),
    (async () => {
      if (!user.email) {
        return null;
      }
      try {
        return await getDoc(doc(db, COLLECTIONS.allowlist, normalizeEmail(user.email)));
      } catch (error) {
        console.warn("Unable to fetch allowlist entry", error);
        return null;
      }
    })(),
  ]);

  return deriveAccessState({
    role: roleDoc?.exists() ? roleDoc.data()?.role || null : null,
    allowlisted: Boolean(allowDoc?.exists()),
  });
}

window.App = window.App || {};
window.App.access = {
  subscribeToAccess,
  getAccessSnapshot,
  normalizeEmail,
};

export { subscribeToAccess, getAccessSnapshot, normalizeEmail };
