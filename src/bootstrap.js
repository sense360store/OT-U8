(function bootstrap() {
  const deps = window.__deps;
  if (!deps || typeof deps !== "object") {
    throw new Error("Firebase dependencies are not available on window.__deps.");
  }

  const requiredDeps = [
    "initializeApp",
    "getAuth",
    "GoogleAuthProvider",
    "onAuthStateChanged",
    "signInWithPopup",
    "signOut",
    "getFirestore",
    "doc",
    "getDoc",
    "setDoc",
    "serverTimestamp",
  ];

  const missing = requiredDeps.filter((name) => typeof deps[name] !== "function");
  if (missing.length) {
    throw new Error(`Missing Firebase primitives on window.__deps: ${missing.join(", ")}`);
  }

  const {
    initializeApp,
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
  } = deps;

  const firebaseConfig = window.__FIREBASE_CONFIG;
  if (!firebaseConfig) {
    throw new Error("window.__FIREBASE_CONFIG is required to initialise Firebase.");
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  if (typeof provider.setCustomParameters === "function") {
    provider.setCustomParameters({ prompt: "select_account" });
  }
  const db = getFirestore(app);

  const authArea = document.getElementById("authArea");
  const toastRoot = document.getElementById("toast");

  if (!authArea) {
    throw new Error("#authArea element not found in the document.");
  }

  const DEFAULT_TOAST_DURATION = 4000;
  let toastTimer = null;

  function normalizeTone(tone) {
    if (tone === "error") return "error";
    if (tone === "success" || tone === "info") return tone;
    return "info";
  }

  function clearToastTimer() {
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  function showToast(message, tone = "info") {
    if (!toastRoot || !message) {
      return;
    }

    clearToastTimer();
    toastRoot.hidden = false;
    const normalizedTone = normalizeTone(tone);
    toastRoot.setAttribute(
      "aria-live",
      normalizedTone === "error" ? "assertive" : "polite"
    );
    toastRoot.innerHTML = "";

    const toastMessage = document.createElement("div");
    toastMessage.className = "toast-message";
    toastMessage.dataset.type = normalizedTone;
    toastMessage.setAttribute("role", "status");
    toastMessage.textContent = message;

    toastRoot.appendChild(toastMessage);

    toastTimer = window.setTimeout(() => {
      toastRoot.hidden = true;
      toastRoot.innerHTML = "";
    }, DEFAULT_TOAST_DURATION);
  }

  async function checkAllowed(user) {
    if (!user || !user.uid) {
      return false;
    }

    try {
      const roleRef = doc(db, "roles", user.uid);
      const roleSnap = await getDoc(roleRef);
      if (roleSnap.exists()) {
        return true;
      }

      const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
      if (!email) {
        return false;
      }

      const allowlistRef = doc(db, "allowlist", email);
      const allowlistSnap = await getDoc(allowlistRef);
      return allowlistSnap.exists();
    } catch (error) {
      console.error("Failed to check access permissions", error);
      throw error;
    }
  }

  function createUserSummary(user) {
    const wrapper = document.createElement("div");
    wrapper.className = "auth-user";

    const avatar = document.createElement("div");
    avatar.className = "auth-user__avatar";
    const displayName = user.displayName || user.email || "Signed in";
    avatar.textContent = (displayName || "").slice(0, 2).toUpperCase();

    const meta = document.createElement("div");
    meta.className = "auth-user__meta";

    const nameLine = document.createElement("p");
    nameLine.className = "auth-user__name";
    nameLine.textContent = displayName;

    const emailLine = document.createElement("p");
    emailLine.className = "auth-user__email";
    emailLine.textContent = user.email || "";

    meta.append(nameLine);
    if (user.email) {
      meta.append(emailLine);
    }

    wrapper.append(avatar, meta);
    return wrapper;
  }

  function createSignOutButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-secondary";
    button.textContent = "Sign out";

    button.addEventListener("click", () => {
      button.disabled = true;
      signOut(auth).catch((error) => {
        console.error("Sign out failed", error);
        showToast("Unable to sign out. Please try again.", "error");
      }).finally(() => {
        button.disabled = false;
      });
    });

    return button;
  }

  function renderSignedOut() {
    authArea.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "auth-state auth-state--signed-out";

    const message = document.createElement("p");
    message.textContent = "Sign in to manage training sessions.";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Sign in with Google";
    button.addEventListener("click", () => {
      button.disabled = true;
      signInWithPopup(auth, provider)
        .catch((error) => {
          console.error("Google sign-in failed", error);
          showToast("Google sign-in failed. Please try again.", "error");
        })
        .finally(() => {
          button.disabled = false;
        });
    });

    wrapper.append(message, button);
    authArea.appendChild(wrapper);
  }

  function renderChecking(user) {
    authArea.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "auth-state auth-state--checking";

    const heading = document.createElement("p");
    const who = user.email || user.displayName || "your account";
    heading.textContent = `Checking access for ${who}…`;

    wrapper.append(heading, createSignOutButton());
    authArea.appendChild(wrapper);
  }

  function renderSignedIn(user) {
    authArea.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "auth-state auth-state--signed-in";

    const info = createUserSummary(user);
    const signOutButton = createSignOutButton();

    wrapper.append(info, signOutButton);
    authArea.appendChild(wrapper);
  }

  function renderAccessRequired(user) {
    authArea.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "auth-state auth-state--restricted";

    const info = createUserSummary(user);
    wrapper.appendChild(info);

    const panel = document.createElement("section");
    panel.className = "access-request";

    const title = document.createElement("h3");
    title.textContent = "Access required";

    const description = document.createElement("p");
    description.textContent = "Let the coaching team know why you need access and we'll be in touch.";

    const form = document.createElement("form");
    form.className = "access-request__form";

    const label = document.createElement("label");
    label.setAttribute("for", "access-request-message");
    label.textContent = "Add a short note";

    const textarea = document.createElement("textarea");
    textarea.id = "access-request-message";
    textarea.name = "message";
    textarea.rows = 3;
    textarea.required = false;
    textarea.placeholder = "Hi coach, I'd like to help manage sessions.";

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "button";
    submitButton.textContent = "Request access";

    form.append(label, textarea, submitButton);
    panel.append(title, description, form);
    wrapper.append(panel);

    const signOutButton = createSignOutButton();
    wrapper.appendChild(signOutButton);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");

      const message = textarea.value.trim();
      try {
        await setDoc(doc(db, "access_requests", user.uid), {
          email: user.email || "",
          displayName: user.displayName || "",
          message,
          requestedAt: serverTimestamp(),
        });
        showToast("Access request sent.", "success");
        textarea.value = "";
      } catch (error) {
        console.error("Failed to submit access request", error);
        showToast("Couldn't send your request. Please try again.", "error");
      } finally {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    });

    authArea.appendChild(wrapper);
  }

  let authEventId = 0;
  onAuthStateChanged(auth, (user) => {
    authEventId += 1;
    const currentEvent = authEventId;

    if (!user) {
      renderSignedOut();
      return;
    }

    renderChecking(user);

    checkAllowed(user)
      .then((isAllowed) => {
        if (currentEvent !== authEventId) {
          return;
        }
        if (isAllowed) {
          renderSignedIn(user);
        } else {
          renderAccessRequired(user);
        }
      })
      .catch((error) => {
        if (currentEvent !== authEventId) {
          return;
        }
        console.error("Access verification failed", error);
        showToast("We couldn't confirm your access. You can request it below.", "error");
        renderAccessRequired(user);
      });
  });
})();
