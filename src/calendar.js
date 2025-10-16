const { collection, onSnapshot, orderBy, query } = window.__deps || {};

if (!collection || !onSnapshot || !orderBy || !query) {
  throw new Error(
    "Firestore dependencies are missing. Ensure firebase-deps script is loaded before calendar.js."
  );
}

let calendarInstance;
let unsubscribeEvents;
let eventSelectedCallback;
let eventsChangedCallback;
let currentView = "dayGridMonth";
let selectedEventId = null;
let cachedEvents = [];

const eventsCache = new Map();

const calendarActions = {
  getCurrentUser: defaultGetCurrentUser,
  canEditEvent: defaultCanEditEvent,
  createEvent: defaultCreateEvent,
  updateEvent: defaultUpdateEvent,
  deleteEvent: defaultDeleteEvent,
};

let activeDialog = null;
let activeDialogCleanup = null;

function initCalendar({
  onSelect,
  getCurrentUser,
  canEditEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} = {}) {
  onEventSelected = onSelect;

  if (typeof getCurrentUser === "function") {
    calendarActions.getCurrentUser = getCurrentUser;
  }
  if (typeof canEditEvent === "function") {
    calendarActions.canEditEvent = canEditEvent;
  }
  if (typeof createEvent === "function") {
    calendarActions.createEvent = createEvent;
  }
  if (typeof updateEvent === "function") {
    calendarActions.updateEvent = updateEvent;
  }
  if (typeof deleteEvent === "function") {
    calendarActions.deleteEvent = deleteEvent;
  }

  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) {
    throw new Error("Calendar element not found");
  }

  if (!window.App?.firebase?.db) {
    throw new Error("Firestore is not available. Ensure Firebase is initialized.");
  }

  calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: currentView,
    height: "auto",
    selectable: true,
    selectMirror: true,
    displayEventTime: true,
    nowIndicator: true,
    dayMaxEventRows: true,
    select(info) {
      calendarInstance.unselect();
      openCreateSessionDialog(info);
    },
    eventClick(info) {
      info.jsEvent?.preventDefault?.();
      const eventId = info.event.id;
      setActiveEvent(eventId);
      const stored = eventsCache.get(eventId);
      const rawEvent = stored || normalizeEvent({ id: eventId, ...info.event.extendedProps.rawEvent });
      if (typeof onEventSelected === "function") {
        onEventSelected(rawEvent);
      }
      openEventDetailsDialog(rawEvent);
    },
    eventDidMount(info) {
      info.el.setAttribute("tabindex", "0");
      info.el.addEventListener("keypress", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          info.el.click();
        }
      });
    },
  });

  calendarInstance.render();

  const monthButton = document.getElementById("view-month");
  const listButton = document.getElementById("view-list");

  monthButton?.addEventListener("click", () => switchView("dayGridMonth", monthButton, listButton));
  listButton?.addEventListener("click", () => switchView("listMonth", listButton, monthButton));

  subscribeToEvents();
}

function subscribeToEvents() {
  const { db } = window.App.firebase;
  const eventsRef = collection(db, "events");
  const eventsQuery = query(eventsRef, orderBy("start"));

  unsubscribeEvents?.();
  unsubscribeEvents = onSnapshot(
    eventsQuery,
    (snapshot) => {
      const events = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      cachedEvents = events;
      renderEvents(events);
      if (typeof eventsChangedCallback === "function") {
        eventsChangedCallback([...cachedEvents]);
      }
    },
    (error) => {
      console.error("Failed to load events", error);
    }
  );
}

function renderEvents(events) {
  if (!calendarInstance) return;

  const mappedEvents = events
    .map((event) => ({
      rawEvent: event,
      calendarEvent: {
        id: event.id,
        title: event.title || "Training Session",
        start: normalizeDate(event.start),
        end: normalizeDate(event.end),
        extendedProps: { rawEvent: event },
      },
    }))
    .filter((item) => item.calendarEvent.start);

  calendarInstance.batchRendering(() => {
    calendarInstance.removeAllEvents();
    mappedEvents.forEach((item) => {
      calendarInstance.addEvent(item.calendarEvent);
    });
  });

  if (selectedEventId) {
    setActiveEvent(selectedEventId);
  }
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  try {
    return new Date(value).toISOString();
  } catch (error) {
    console.warn("Unable to parse date", value, error);
    return null;
  }
}

function switchView(viewName, activeButton, inactiveButton) {
  if (!calendarInstance) return;
  currentView = viewName;
  calendarInstance.changeView(viewName);
  if (activeButton && inactiveButton) {
    activeButton.setAttribute("aria-pressed", "true");
    inactiveButton.setAttribute("aria-pressed", "false");
  }
}

function setEvents(events = []) {
  if (!calendarInstance) return;
  eventsCache.clear();
  calendarInstance.removeAllEvents();
  events.forEach((event) => {
    if (!event?.id) return;
    const normalized = normalizeEvent(event);
    eventsCache.set(normalized.id, normalized);
    calendarInstance.addEvent({
      id: normalized.id,
      title: normalized.title,
      start: normalized.start,
      end: normalized.end,
      extendedProps: { rawEvent: normalized },
    });
  });
}

function setActiveEvent(eventId) {
  if (!calendarInstance) return;
  selectedEventId = eventId;
  calendarInstance.getEvents().forEach((event) => {
    const isActive = event.id === eventId;
    event.setProp("backgroundColor", isActive ? "#dbeafe" : "");
    event.setProp("borderColor", isActive ? "#1d4ed8" : "");
  });
}

function openCreateSessionDialog(selectionInfo) {
  const start = selectionInfo?.start ? new Date(selectionInfo.start) : new Date();
  let end = selectionInfo?.end ? new Date(selectionInfo.end) : null;

  if (!end || end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  openSessionFormDialog({
    mode: "create",
    initial: { start, end },
  });
}

function openEventDetailsDialog(eventData) {
  if (!eventData) {
    return;
  }

  const dialog = document.createElement("dialog");
  dialog.className = "calendar-dialog calendar-dialog--details";

  const body = document.createElement("div");
  body.className = "calendar-dialog__body";

  const title = document.createElement("h2");
  title.textContent = eventData.title || "Session details";
  body.appendChild(title);

  const meta = document.createElement("dl");
  meta.className = "calendar-dialog__meta";
  const startLabel = formatDisplayDate(eventData.start);
  if (startLabel) {
    appendMetaRow(meta, "Starts", startLabel);
  }
  const endLabel = formatDisplayDate(eventData.end);
  if (endLabel) {
    appendMetaRow(meta, "Ends", endLabel);
  }
  if (eventData.location) {
    appendMetaRow(meta, "Location", eventData.location);
  }
  if (eventData.notes) {
    appendMetaRow(meta, "Notes", eventData.notes);
  }
  body.appendChild(meta);

  const rsvpSection = document.createElement("div");
  rsvpSection.className = "calendar-dialog__rsvp";
  body.appendChild(rsvpSection);

  const restoreRsvpPanel = attachExistingRsvpPanel(rsvpSection);
  if (!restoreRsvpPanel) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "RSVP panel unavailable.";
    rsvpSection.appendChild(placeholder);
  }

  dialog.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "calendar-dialog__footer";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "button button-secondary";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => closeActiveDialog());
  footer.appendChild(closeButton);

  const user = calendarActions.getCurrentUser?.();
  if (calendarActions.canEditEvent?.(eventData, user)) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      closeActiveDialog();
      openSessionFormDialog({ mode: "edit", eventData });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button-danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => handleDeleteEvent(eventData, deleteButton));

    footer.append(editButton, deleteButton);
  }

  dialog.appendChild(footer);

  attachDialog(dialog, {
    onClose: () => {
      restoreRsvpPanel?.();
    },
  });
}

function openSessionFormDialog({ mode, eventData, initial }) {
  const dialog = document.createElement("dialog");
  dialog.className = `calendar-dialog calendar-dialog--form calendar-dialog--${mode}`;

  const form = document.createElement("form");
  form.className = "calendar-dialog__form";
  form.noValidate = true;

  const heading = document.createElement("h2");
  heading.textContent = mode === "edit" ? "Edit Session" : "Create Session";
  form.appendChild(heading);

  const fieldset = document.createElement("div");
  fieldset.className = "calendar-dialog__fields";

  const titleLabel = document.createElement("label");
  titleLabel.textContent = "Title";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.required = true;
  titleInput.autocomplete = "off";
  titleInput.value = mode === "edit" ? eventData?.title || "" : "";
  titleLabel.appendChild(titleInput);
  fieldset.appendChild(titleLabel);

  const startLabel = document.createElement("label");
  startLabel.textContent = "Start";
  const startInput = document.createElement("input");
  startInput.type = "datetime-local";
  startInput.required = true;
  const startDate = mode === "edit" ? eventData?.start : initial?.start;
  startInput.value = formatDateTimeLocal(startDate);
  startLabel.appendChild(startInput);
  fieldset.appendChild(startLabel);

  const endLabel = document.createElement("label");
  endLabel.textContent = "End";
  const endInput = document.createElement("input");
  endInput.type = "datetime-local";
  const endDate = mode === "edit" ? eventData?.end : initial?.end;
  endInput.value = formatDateTimeLocal(endDate);
  endLabel.appendChild(endInput);
  fieldset.appendChild(endLabel);

  const locationLabel = document.createElement("label");
  locationLabel.textContent = "Location";
  const locationInput = document.createElement("input");
  locationInput.type = "text";
  locationInput.autocomplete = "off";
  locationInput.value = mode === "edit" ? eventData?.location || "" : "";
  locationLabel.appendChild(locationInput);
  fieldset.appendChild(locationLabel);

  const notesLabel = document.createElement("label");
  notesLabel.textContent = "Notes";
  const notesInput = document.createElement("textarea");
  notesInput.rows = 3;
  notesInput.value = mode === "edit" ? eventData?.notes || "" : "";
  notesLabel.appendChild(notesInput);
  fieldset.appendChild(notesLabel);

  form.appendChild(fieldset);

  const footer = document.createElement("div");
  footer.className = "calendar-dialog__footer";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button-secondary";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => closeActiveDialog());

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button";
  submitButton.textContent = mode === "edit" ? "Save" : "Create";

  footer.append(cancelButton, submitButton);
  form.appendChild(footer);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const startValue = parseDateInput(startInput.value);
    const endValueRaw = endInput.value ? parseDateInput(endInput.value) : null;
    const location = locationInput.value.trim();
    const notes = notesInput.value.trim();

    if (!title) {
      showToast("Enter a session title.", { tone: "error" });
      titleInput.focus();
      return;
    }

    if (!startValue) {
      showToast("Select a start date and time.", { tone: "error" });
      startInput.focus();
      return;
    }

    if (endInput.value && !endValueRaw) {
      showToast("End time is invalid.", { tone: "error" });
      endInput.focus();
      return;
    }

    if (endValueRaw && endValueRaw <= startValue) {
      showToast("End time must be after the start time.", { tone: "error" });
      endInput.focus();
      return;
    }

    submitButton.disabled = true;
    cancelButton.disabled = true;

    const payload = {
      title,
      start: startValue,
      end: endValueRaw,
      location,
      notes,
    };

    try {
      if (mode === "create") {
        const currentUser = calendarActions.getCurrentUser?.();
        payload.createdBy = currentUser?.uid || "";
        await calendarActions.createEvent(payload);
        showToast("Session created.", { tone: "success" });
      } else {
        if (!eventData?.id) {
          throw new Error("Missing event identifier");
        }
        await calendarActions.updateEvent(eventData.id, payload);
        showToast("Session updated.", { tone: "success" });
      }
      closeActiveDialog();
    } catch (error) {
      console.error(error);
      showToast(error?.message || "Unable to save session.", { tone: "error" });
    } finally {
      submitButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  dialog.appendChild(form);

  attachDialog(dialog);
  setTimeout(() => {
    titleInput.focus();
    titleInput.select?.();
  }, 0);
}

function handleDeleteEvent(eventData, button) {
  if (!eventData?.id) return;
  if (button.disabled) return;

  const confirmation = window.confirm(`Delete "${eventData.title || "session"}"? This cannot be undone.`);
  if (!confirmation) {
    return;
  }

  button.disabled = true;

  calendarActions
    .deleteEvent(eventData.id)
    .then(() => {
      showToast("Session deleted.", { tone: "success" });
      closeActiveDialog();
    })
    .catch((error) => {
      console.error(error);
      showToast(error?.message || "Unable to delete session.", { tone: "error" });
    })
    .finally(() => {
      button.disabled = false;
    });
}

function attachDialog(dialog, { onClose } = {}) {
  closeActiveDialog();
  document.body.appendChild(dialog);
  activeDialog = dialog;
  activeDialogCleanup = onClose || null;

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeActiveDialog();
  });

  dialog.addEventListener(
    "close",
    () => {
      const cleanup = activeDialogCleanup;
      activeDialogCleanup = null;
      if (typeof cleanup === "function") {
        cleanup();
      }
      dialog.remove();
      if (activeDialog === dialog) {
        activeDialog = null;
      }
    },
    { once: true }
  );

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "open");
  }
}

function closeActiveDialog() {
  if (!activeDialog) return;
  if (typeof activeDialog.close === "function") {
    activeDialog.close();
  } else {
    activeDialog.removeAttribute("open");
    activeDialog.dispatchEvent(new Event("close"));
  }
}

function attachExistingRsvpPanel(target) {
  const detailsEl = document.getElementById("details");
  if (!detailsEl || !detailsEl.parentElement) {
    return null;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "calendar-dialog__rsvp-placeholder";
  placeholder.hidden = true;
  const parent = detailsEl.parentElement;
  parent.insertBefore(placeholder, detailsEl);
  target.appendChild(detailsEl);
  detailsEl.classList.add("calendar-dialog__rsvp-panel");

  return () => {
    detailsEl.classList.remove("calendar-dialog__rsvp-panel");
    if (placeholder.parentElement) {
      placeholder.parentElement.replaceChild(detailsEl, placeholder);
    }
    placeholder.remove();
  };
}

function defaultCreateEvent(data) {
  const fn = window.App?.dataModel?.createEvent;
  if (typeof fn !== "function") {
    return Promise.reject(new Error("Event creation is unavailable."));
  }
  return fn(data);
}

function defaultUpdateEvent(eventId, data) {
  const fn = window.App?.dataModel?.updateEvent;
  if (typeof fn !== "function") {
    return Promise.reject(new Error("Event editing is unavailable."));
  }
  return fn(eventId, data);
}

function defaultDeleteEvent(eventId) {
  const fn = window.App?.dataModel?.deleteEvent;
  if (typeof fn !== "function") {
    return Promise.reject(new Error("Event deletion is unavailable."));
  }
  return fn(eventId);
}

function defaultGetCurrentUser() {
  const firebaseAuth = window.App?.firebase?.auth;
  if (firebaseAuth?.currentUser) {
    return firebaseAuth.currentUser;
  }
  if (window.App?.auth?.currentUser) {
    return window.App.auth.currentUser;
  }
  if (window.App?.session?.user) {
    return window.App.session.user;
  }
  return window.App?.currentUser || null;
}

function defaultCanEditEvent(event, user) {
  if (!event || !user) return false;
  if (event.createdBy && user.uid && event.createdBy === user.uid) {
    return true;
  }
  if (user.isAdmin) {
    return true;
  }
  if (window.App?.permissions?.canEditEvent) {
    try {
      return Boolean(window.App.permissions.canEditEvent(event, user));
    } catch (error) {
      console.warn("canEditEvent error", error);
    }
  }
  return false;
}

function showToast(message, options) {
  if (typeof window.App?.ui?.showToast === "function") {
    window.App.ui.showToast(message, options);
  }
}

function normalizeEvent(event) {
  if (!event) return null;
  const normalized = { ...event };
  if (event.start) {
    normalized.start = event.start instanceof Date ? new Date(event.start.getTime()) : new Date(event.start);
  }
  if (event.end) {
    normalized.end = event.end instanceof Date ? new Date(event.end.getTime()) : new Date(event.end);
  }
  return normalized;
}

function formatDateTimeLocal(date) {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const pad = (input) => String(input).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(date) {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
  return formatter.format(value);
}

function appendMetaRow(list, label, value) {
  if (!value) return;
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  list.append(dt, dd);
}

window.App = window.App || {};
window.App.calendar = {
  initCalendar,
  setActiveEvent,
  onEventSelected,
  onEventsChanged,
};

export { initCalendar, setActiveEvent, onEventSelected, onEventsChanged };
