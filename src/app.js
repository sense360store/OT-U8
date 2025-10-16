import "./firebase.js";
import "./calendar.js";
import "./rsvp.js";

import {
  listenToAuth,
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  sendReset,
  signOutUser,
} from "./auth.js";
import {
  listenToEvents,
  listenToRsvps,
  saveMyRsvp,
  checkIfAdmin,
} from "./dataModel.js";
import {
  initUI,
  renderAuth,
  renderEventDetails,
  showToast as uiShowToast,
} from "./ui.js";

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
  events: [],
  selectedEventId: null,
  selectedEvent: null,
  rsvps: [],
  isLoadingRsvps: false,
  user: null,
  isAdmin: false,
  hasAccess: window.App?.access?.isAccessGranted?.() ?? null,
  accessReady: true,
};

let unsubscribeEvents = null;
let unsubscribeRsvps = null;
let unsubscribeAuth = null;
let currentAdminRequest = 0;

function getCalendarApi() {
  return window.App?.calendar || {};
}

function cleanupRsvpListener() {
  if (typeof unsubscribeRsvps === "function") {
    unsubscribeRsvps();
  }
  unsubscribeRsvps = null;
  syncSessionState();
}

function syncSessionState() {
  window.App = window.App || {};
  const session = window.App.session || {};
  session.user = appState.user;
  session.isAdmin = appState.isAdmin;
  session.selectedEventId = appState.selectedEventId;
  session.selectedEvent = appState.selectedEvent;
  session.events = appState.events.slice();
  session.rsvps = appState.rsvps.slice();
  session.getSelectedEvent = () => appState.selectedEvent;
  session.getEvents = () => appState.events.slice();
  session.getRsvps = () => appState.rsvps.slice();
  session.selectEvent = selectEvent;
  session.clearRsvpListener = cleanupRsvpListener;
  session.unsubscribeEvents = unsubscribeEvents;
  session.unsubscribeAuth = unsubscribeAuth;
  session.unsubscribeRsvps = unsubscribeRsvps;
  window.App.session = session;
  window.App.currentUser = appState.user;
}

function renderAppState() {
  renderAuth({
    user: appState.user,
    isAdmin: appState.isAdmin,
    hasAccess: appState.hasAccess,
    accessReady: appState.accessReady,
  });

  renderEventDetails({
    event: appState.selectedEvent,
    rsvps: appState.rsvps,
    user: appState.user,
    isAdmin: appState.isAdmin,
    isLoadingRsvps: appState.isLoadingRsvps,
    hasAccess: appState.hasAccess,
    accessReady: appState.accessReady,
  });
}

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

function handleEventsUpdate(events = []) {
  appState.events = Array.isArray(events) ? events.slice() : [];

  const calendarApi = getCalendarApi();
  try {
    calendarApi.setEvents?.(appState.events);
  } catch (error) {
    console.warn("Unable to update calendar events", error);
  }

  if (!appState.events.length) {
    cleanupRsvpListener();
    appState.selectedEventId = null;
    appState.selectedEvent = null;
    appState.rsvps = [];
    appState.isLoadingRsvps = false;
    syncSessionState();
    renderAppState();
    return;
  }

  const current = appState.events.find((event) => event.id === appState.selectedEventId) || null;
  if (!current) {
    selectEvent(appState.events[0]);
    return;
  }

  appState.selectedEvent = current;
  syncSessionState();
  renderAppState();
}

function selectEvent(eventOrId) {
  const eventId = typeof eventOrId === "string" ? eventOrId : eventOrId?.id ?? null;
  const eventData =
    (eventOrId && typeof eventOrId === "object")
      ? eventOrId
      : appState.events.find((item) => item.id === eventId) || null;

  if (appState.selectedEventId === eventId && appState.selectedEvent === eventData) {
    syncSessionState();
    renderAppState();
    return;
  }

  cleanupRsvpListener();

  appState.selectedEventId = eventId;
  appState.selectedEvent = eventData || null;
  appState.rsvps = [];
  appState.isLoadingRsvps = Boolean(eventId);

  try {
    getCalendarApi().setActiveEvent?.(eventId);
  } catch (error) {
    console.warn("Unable to update calendar selection", error);
  }

  syncSessionState();
  renderAppState();

  if (!eventId) {
    appState.isLoadingRsvps = false;
    syncSessionState();
    renderAppState();
    return;
  }

  const unsubscribe = listenToRsvps(eventId, (rsvpList = []) => {
    if (appState.selectedEventId !== eventId) {
      unsubscribe();
      return;
    }
    appState.rsvps = Array.isArray(rsvpList) ? rsvpList.slice() : [];
    appState.isLoadingRsvps = false;
    syncSessionState();
    renderAppState();
  });

  unsubscribeRsvps = unsubscribe;
  syncSessionState();
}

function handleAuthChange(user) {
  cleanupRsvpListener();

  appState.user = user || null;
  appState.isAdmin = false;
  appState.hasAccess = window.App?.access?.isAccessGranted?.() ?? appState.hasAccess;

  syncSessionState();
  renderAppState();

  if (!user?.uid) {
    return;
  }

  const requestId = ++currentAdminRequest;
  checkIfAdmin(user.uid)
    .then((isAdmin) => {
      if (requestId !== currentAdminRequest) {
        return;
      }
      appState.isAdmin = Boolean(isAdmin);
      syncSessionState();
      renderAppState();
    })
    .catch((error) => {
      console.error("Failed to check admin status", error);
    });
}

async function handleRsvpSubmit(status) {
  if (!status) {
    return;
  }
  if (!appState.selectedEventId) {
    uiShowToast("Select an event before responding.", { tone: "error" });
    return;
  }
  if (!appState.user) {
    uiShowToast("Sign in to RSVP.", { tone: "error" });
    return;
  }

  try {
    await saveMyRsvp(appState.selectedEventId, appState.user, status);
    uiShowToast("RSVP saved.", { tone: "success" });
  } catch (error) {
    console.error(error);
    uiShowToast(error?.message || "Unable to save RSVP.", { tone: "error" });
  }
}

function initRealtimeFeatures() {
  initUI({
    onGoogleSignIn: () => signInWithGoogle(),
    onEmailSignIn: (email, password) => signInWithEmail(email, password),
    onRegister: (email, password, suggestedName) =>
      registerWithEmail(email, password, suggestedName),
    onResetPassword: (email) => sendReset(email),
    onSignOut: () => signOutUser(),
    onRsvpSubmit: handleRsvpSubmit,
  });

  const calendarApi = getCalendarApi();
  calendarApi.onEventSelected?.((event) => selectEvent(event));

  if (!unsubscribeEvents) {
    unsubscribeEvents = listenToEvents(handleEventsUpdate);
    syncSessionState();
  }

  if (!unsubscribeAuth) {
    unsubscribeAuth = listenToAuth(handleAuthChange);
    syncSessionState();
  }

  syncSessionState();
  renderAppState();
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

  initRealtimeFeatures();

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
