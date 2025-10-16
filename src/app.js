import "./firebase.js";
import "./auth.js";
import "./dataModel.js";
import "./rsvp.js";
import "./access.js";
import { initUI, renderAuth, renderEventDetails, showToast as uiShowToast } from "./ui.js";

const DEFAULT_TITLE = "Ossett U8s Training";
const DEFAULT_LOCATION = "Ossett, ENG";
const DEFAULT_DURATION_MINUTES = 60;

let form;
let titleInput;
let startInput;
let endInput;
let locationInput;
let notesInput;
let errorSummary;
let summaryContainer;
let summaryList;
let summaryPlaceholder;

const MINUTE_IN_MS = 60 * 1000;

const appState = {
  user: null,
  isAdmin: false,
  hasAccess: false,
  accessReady: true,
  events: [],
  activeEventId: null,
  rsvps: [],
  isLoadingRsvps: false,
};

let unsubscribeEvents;
let unsubscribeRsvps;

const initFooterYear = () => {
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
};

function cacheFormElements() {
  form = document.getElementById("event-form");
  if (!form) return;

  titleInput = form.querySelector("#title");
  startInput = form.querySelector("#start");
  endInput = form.querySelector("#end");
  locationInput = form.querySelector("#location");
  notesInput = form.querySelector("#notes");
  errorSummary = document.getElementById("form-errors");
  summaryContainer = document.getElementById("event-summary");
  summaryList = summaryContainer?.querySelector(".summary-list") ?? null;
  summaryPlaceholder = summaryContainer?.querySelector(".placeholder") ?? null;
}

function setDefaultFieldValues() {
  if (!form) return;
  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = DEFAULT_TITLE;
  }
  if (locationInput && !locationInput.value.trim()) {
    locationInput.value = DEFAULT_LOCATION;
  }
  if (startInput && endInput) {
    endInput.min = startInput.value || "";
  }
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatForDateTimeLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (number) => String(number).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function showErrors(messages = []) {
  if (!errorSummary) return;
  errorSummary.innerHTML = "";
  if (!messages.length) {
    errorSummary.hidden = true;
    return;
  }
  const list = document.createElement("ul");
  messages.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.appendChild(item);
  });
  errorSummary.appendChild(list);
  errorSummary.hidden = false;
}

function updateSummary(payload) {
  if (!summaryList) return;
  if (summaryPlaceholder) {
    summaryPlaceholder.hidden = true;
  }
  summaryList.hidden = false;

  const fields = {
    title: payload.title,
    location: payload.location || "—",
    start: payload.start,
    end: payload.end,
    notes: payload.notes || "—",
  };

  Object.entries(fields).forEach(([key, value]) => {
    const target = summaryList.querySelector(`[data-field='${key}']`);
    if (target) {
      target.textContent = value;
    }
  });
}

function ensureEndAfterStart() {
  if (!startInput || !endInput) return;
  const startDate = parseLocalDateTime(startInput.value);
  if (!startDate) {
    endInput.min = "";
    return;
  }
  endInput.min = startInput.value;
  const endDate = parseLocalDateTime(endInput.value);
  if (!endDate || endDate <= startDate) {
    const adjustedEnd = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * MINUTE_IN_MS);
    endInput.value = formatForDateTimeLocal(adjustedEnd);
  }
}

function getNormalisedPayload() {
  const errors = [];

  const title = (titleInput?.value ?? "").trim();
  if (!title) {
    errors.push("Title is required.");
  }

  const startDate = parseLocalDateTime(startInput?.value ?? "");
  if (!startDate) {
    errors.push("Please provide a valid start date and time.");
  }

  let endDate = parseLocalDateTime(endInput?.value ?? "");
  if (!endDate && startDate) {
    endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * MINUTE_IN_MS);
    if (endInput) {
      endInput.value = formatForDateTimeLocal(endDate);
      endInput.min = startInput?.value || "";
    }
  }

  if (!endDate) {
    errors.push("End time is required. We'll default to one hour after the start when possible.");
  }

  if (startDate && endDate && endDate <= startDate) {
    errors.push("End time must be after the start time.");
  }

  if (errors.length) {
    return { errors, payload: null };
  }

  const payload = {
    title,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    location: (locationInput?.value ?? "").trim(),
    notes: (notesInput?.value ?? "").trim(),
  };

  return { errors, payload };
}

function handleSubmit(event) {
  event.preventDefault();
  const { errors, payload } = getNormalisedPayload();

  if (errors.length || !payload) {
    showErrors(errors);
    return;
  }

  showErrors([]);
  updateSummary(payload);
  uiShowToast("Training session saved", { tone: "success" });
  // eslint-disable-next-line no-console
  console.info("Normalised session payload", payload);
}

function computeHasAccess() {
  if (appState.user) {
    return true;
  }
  return window.App?.access?.isAccessGranted?.() ?? false;
}

function normaliseEvent(event) {
  if (!event) return null;
  const toIso = (value) => {
    if (!value) return value;
    if (typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (typeof value === "object" && typeof value.seconds === "number") {
      return new Date(value.seconds * 1000).toISOString();
    }
    return value;
  };

  return {
    ...event,
    start: toIso(event.start),
    end: toIso(event.end),
  };
}

function getActiveEvent() {
  if (!appState.activeEventId) {
    return null;
  }
  return appState.events.find((event) => event.id === appState.activeEventId) || null;
}

function renderAuthView() {
  appState.hasAccess = computeHasAccess();
  renderAuth({
    user: appState.user,
    isAdmin: appState.isAdmin,
    hasAccess: appState.hasAccess,
    accessReady: appState.accessReady,
  });
}

function renderDetailsView() {
  renderEventDetails({
    event: getActiveEvent(),
    rsvps: appState.rsvps,
    user: appState.user,
    isAdmin: appState.isAdmin,
    isLoadingRsvps: appState.isLoadingRsvps,
    hasAccess: appState.hasAccess,
    accessReady: appState.accessReady,
  });
}

function refreshRsvpSubscription() {
  if (typeof unsubscribeRsvps === "function") {
    unsubscribeRsvps();
  }

  const eventId = appState.activeEventId;
  if (!eventId || !appState.user || !window.App?.dataModel?.listenToRsvps) {
    unsubscribeRsvps = undefined;
    appState.rsvps = [];
    appState.isLoadingRsvps = false;
    renderDetailsView();
    return;
  }

  appState.isLoadingRsvps = true;
  renderDetailsView();

  unsubscribeRsvps = window.App.dataModel.listenToRsvps(eventId, (rsvps) => {
    appState.rsvps = rsvps;
    appState.isLoadingRsvps = false;
    renderDetailsView();
  });
}

function subscribeToEvents() {
  if (!window.App?.dataModel?.listenUpcomingEvents) {
    return;
  }

  if (typeof unsubscribeEvents === "function") {
    unsubscribeEvents();
  }

  unsubscribeEvents = window.App.dataModel.listenUpcomingEvents((events) => {
    const normalised = events.map(normaliseEvent);
    appState.events = normalised;

    if (!appState.activeEventId || !normalised.some((event) => event.id === appState.activeEventId)) {
      appState.activeEventId = normalised[0]?.id ?? null;
    }

    renderDetailsView();
    refreshRsvpSubscription();
  });
}

async function handleAuthChange(user) {
  if (typeof unsubscribeRsvps === "function") {
    unsubscribeRsvps();
    unsubscribeRsvps = undefined;
  }

  appState.user = user;
  appState.isAdmin = false;
  appState.accessReady = !user;
  renderAuthView();
  renderDetailsView();

  if (!user?.uid) {
    appState.accessReady = true;
    appState.isLoadingRsvps = false;
    renderAuthView();
    renderDetailsView();
    return;
  }

  try {
    if (window.App?.dataModel?.checkIfAdmin) {
      appState.isAdmin = await window.App.dataModel.checkIfAdmin(user.uid);
    }
  } catch (error) {
    console.error(error);
  } finally {
    appState.accessReady = true;
    renderAuthView();
    refreshRsvpSubscription();
    renderDetailsView();
  }
}

function handleRsvpSubmit(status) {
  const eventId = appState.activeEventId;

  if (!eventId) {
    uiShowToast("Select a session first", { tone: "error" });
    return;
  }

  if (!appState.user) {
    uiShowToast("Sign in to share your RSVP", { tone: "error" });
    return;
  }

  if (!window.App?.dataModel?.saveMyRsvp) {
    uiShowToast("RSVP service unavailable", { tone: "error" });
    return;
  }

  window.App.dataModel
    .saveMyRsvp(eventId, appState.user, status)
    .then(() => {
      uiShowToast("RSVP saved", { tone: "success" });
    })
    .catch((error) => {
      console.error(error);
      uiShowToast(error?.message || "Unable to save RSVP", { tone: "error" });
    });
}

function initRealtimeUi() {
  initUI({
    onGoogleSignIn: () => window.App?.auth?.signInWithGoogle?.(),
    onEmailSignIn: (email, password) => window.App?.auth?.signInWithEmail?.(email, password),
    onRegister: (email, password, suggestedName) =>
      window.App?.auth?.registerWithEmail?.(email, password, suggestedName),
    onResetPassword: (email) => window.App?.auth?.sendReset?.(email),
    onSignOut: () => window.App?.auth?.signOutUser?.(),
    onRsvpSubmit: handleRsvpSubmit,
  });

  renderAuthView();
  renderDetailsView();

  if (window.App?.auth?.listenToAuth) {
    window.App.auth.listenToAuth(handleAuthChange);
  }

  subscribeToEvents();
}

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();
  cacheFormElements();
  setDefaultFieldValues();
  initRealtimeUi();

  try {
    initCalendar({
      onSelect: (event) => {
        window.App?.ui?.renderEventDetails?.(event);
      },
    });
  } catch (error) {
    console.error("Failed to initialise calendar", error);
  }

  if (!form) {
    return;
  }

  form.addEventListener("submit", handleSubmit);

  if (startInput) {
    startInput.addEventListener("change", ensureEndAfterStart);
    startInput.addEventListener("blur", ensureEndAfterStart);
  }

  if (endInput) {
    endInput.addEventListener("focus", () => {
      if (!startInput?.value) {
        return;
      }
      ensureEndAfterStart();
    });
  }
});
