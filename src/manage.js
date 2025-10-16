import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { auth } from "./firebase.js";
import {
  listenToEvents,
  createEvent,
  updateEvent as updateEventRecord,
  deleteEvent as deleteEventRecord,
  getUserRole,
} from "./dataModel.js";
import { showToast } from "./ui.js";

const manageSection = document.getElementById("manage");
const manageNav = document.getElementById("manage-nav");

if (!manageSection || !manageNav) {
  console.warn("Manage panel elements are missing from the page.");
} else {
  const ALLOWED_ROLES = new Set(["admin", "coach"]);

  let currentUser = null;
  let currentRole = null;
  let isAdmin = false;
  let isAllowed = false;
  let isCheckingAccess = true;
  let isLoadingEvents = false;
  let events = [];
  let unsubscribeFromEvents = null;
  let editingEventId = null;

  const placeholder = manageSection.querySelector(".placeholder");
  placeholder?.remove();

  const stateMessage = document.createElement("div");
  stateMessage.id = "manage-state";
  stateMessage.className = "alert alert-info manage-feedback";
  stateMessage.hidden = true;
  stateMessage.setAttribute("role", "status");

  const form = document.createElement("form");
  form.className = "manage-form";
  form.id = "manage-form";
  form.autocomplete = "off";
  form.innerHTML = `
    <div class="form-heading">
      <h3 id="session-form-heading" class="session-name">Create a session</h3>
      <p id="manage-form-hint" class="session-meta">Title defaults to \"Ossett U8s Training\". Location and notes are optional.</p>
    </div>
    <div class="form-grid">
      <label for="session-title">Title
        <input id="session-title" name="title" type="text" required value="Ossett U8s Training" autocomplete="off" maxlength="120">
      </label>
      <label for="session-date">Date
        <input id="session-date" name="date" type="date" required>
      </label>
      <label for="session-start">Start time
        <input id="session-start" name="start" type="time" required>
      </label>
      <label for="session-end">End time
        <input id="session-end" name="end" type="time" required>
      </label>
      <label for="session-location">Location
        <input id="session-location" name="location" type="text" placeholder="Optional" maxlength="120">
      </label>
      <label for="session-notes" class="notes-field">Notes
        <textarea id="session-notes" name="notes" placeholder="Optional details" maxlength="500"></textarea>
      </label>
    </div>
    <div class="form-actions">
      <button type="submit" class="button" id="session-submit">Save session</button>
      <button type="button" class="button button-secondary" id="session-cancel" hidden>Cancel edit</button>
    </div>
  `;

  const listSection = document.createElement("section");
  listSection.className = "manage-table-section";
  listSection.innerHTML = `
    <header>
      <h3 class="session-name">Upcoming sessions</h3>
      <p class="session-meta">Edit or share upcoming training dates.</p>
    </header>
    <p class="placeholder" id="manage-empty" hidden>No upcoming sessions scheduled yet.</p>
    <div class="manage-table-wrapper">
      <table class="table" aria-describedby="manage-empty">
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Date</th>
            <th scope="col">Time</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  manageSection.append(stateMessage, form, listSection);

  const titleInput = form.querySelector("#session-title");
  const dateInput = form.querySelector("#session-date");
  const startInput = form.querySelector("#session-start");
  const endInput = form.querySelector("#session-end");
  const locationInput = form.querySelector("#session-location");
  const notesInput = form.querySelector("#session-notes");
  const submitButton = form.querySelector("#session-submit");
  const cancelButton = form.querySelector("#session-cancel");
  const formHeading = form.querySelector("#session-form-heading");
  const tableBody = listSection.querySelector("tbody");
  const emptyMessage = listSection.querySelector("#manage-empty");

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    if (typeof value.toDate === "function") {
      return value.toDate();
    }
    if (typeof value === "number") {
      return new Date(value);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeEvent(raw = {}) {
    const startDate = toDate(raw.start);
    const endDate = toDate(raw.end);
    return {
      ...raw,
      startDate,
      endDate,
    };
  }

  function formatDateLabel(date) {
    return date ? dateFormatter.format(date) : "TBC";
  }

  function formatTimeRange(startDate, endDate) {
    if (!startDate && !endDate) {
      return "TBC";
    }
    if (startDate && endDate) {
      if (startDate.toDateString() === endDate.toDateString()) {
        return `${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`;
      }
      return `${timeFormatter.format(startDate)} – ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
    }
    const single = startDate || endDate;
    return timeFormatter.format(single);
  }

  function formatInputDate(date) {
    if (!date) return "";
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatInputTime(date) {
    if (!date) return "";
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function combineDateAndTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    const combined = new Date(`${dateValue}T${timeValue}`);
    if (Number.isNaN(combined.getTime())) {
      return null;
    }
    return combined;
  }

  function setStateMessage(message, tone = "info") {
    if (!message) {
      stateMessage.hidden = true;
      stateMessage.textContent = "";
      return;
    }
    stateMessage.textContent = message;
    stateMessage.hidden = false;
    stateMessage.className = `alert manage-feedback ${tone === "error" ? "alert-error" : "alert-info"}`.trim();
    stateMessage.setAttribute("role", tone === "error" ? "alert" : "status");
  }

  function resetForm() {
    editingEventId = null;
    formHeading.textContent = "Create a session";
    submitButton.textContent = "Save session";
    cancelButton.hidden = true;
    form.reset();
    titleInput.value = "Ossett U8s Training";
  }

  function setLoading(loading) {
    submitButton.disabled = loading;
  }

  function notify(message, tone = "info") {
    if (typeof showToast === "function") {
      showToast(message, { tone });
    } else if (window.App?.ui?.showToast) {
      window.App.ui.showToast(message, { tone });
    } else {
      console.info(message);
    }
  }

  function renderEventsTable() {
    if (!tableBody || !emptyMessage) {
      return;
    }

    tableBody.innerHTML = "";

    if (!isAllowed) {
      emptyMessage.hidden = true;
      return;
    }

    if (isLoadingEvents) {
      emptyMessage.hidden = false;
      emptyMessage.textContent = "Loading upcoming sessions…";
      return;
    }

    const now = Date.now();
    const upcoming = events
      .filter((event) => {
        const reference = event.endDate || event.startDate;
        if (!reference) return false;
        return reference.getTime() >= now;
      })
      .sort((a, b) => {
        const aTime = a.startDate?.getTime?.() || 0;
        const bTime = b.startDate?.getTime?.() || 0;
        return aTime - bTime;
      });

    if (!upcoming.length) {
      emptyMessage.hidden = false;
      emptyMessage.textContent = "No upcoming sessions scheduled yet.";
      return;
    }

    emptyMessage.hidden = true;

    upcoming.forEach((event) => {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      const titleLabel = document.createElement("span");
      titleLabel.className = "session-name";
      titleLabel.textContent = event.title || "Ossett U8s Training";
      titleCell.appendChild(titleLabel);

      if (event.location) {
        const locationMeta = document.createElement("div");
        locationMeta.className = "session-meta";
        locationMeta.textContent = event.location;
        titleCell.appendChild(locationMeta);
      }

      if (event.notes) {
        const notesMeta = document.createElement("div");
        notesMeta.className = "session-meta";
        notesMeta.textContent = event.notes;
        titleCell.appendChild(notesMeta);
      }

      const dateCell = document.createElement("td");
      dateCell.textContent = formatDateLabel(event.startDate || event.endDate);

      const timeCell = document.createElement("td");
      timeCell.textContent = formatTimeRange(event.startDate, event.endDate);

      const actionsCell = document.createElement("td");
      const actionsGroup = document.createElement("div");
      actionsGroup.className = "action-group";

      const canEdit = isAdmin || (!!currentUser && event.createdBy === currentUser.uid);

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "button button-secondary";
      editButton.textContent = "Edit";
      editButton.disabled = !canEdit;
      if (!canEdit) {
        editButton.title = "Only admins or the session owner can edit.";
      }
      editButton.addEventListener("click", () => {
        if (!canEdit) return;
        startEditing(event);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button-danger";
      deleteButton.textContent = "Delete";
      deleteButton.disabled = !canEdit;
      if (!canEdit) {
        deleteButton.title = "Only admins or the session owner can delete.";
      }
      deleteButton.addEventListener("click", () => {
        if (!canEdit) return;
        confirmDelete(event);
      });

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "button button-secondary";
      copyButton.textContent = "Copy link";
      copyButton.addEventListener("click", () => copyLink(event));

      actionsGroup.append(editButton, deleteButton, copyButton);
      actionsCell.appendChild(actionsGroup);

      row.append(titleCell, dateCell, timeCell, actionsCell);
      tableBody.appendChild(row);
    });
  }

  function copyLink(event) {
    const reference = event.startDate || event.endDate;
    if (!reference) {
      notify("Unable to copy a link without a scheduled date", "error");
      return;
    }
    const dateSlug = formatInputDate(reference);
    const url = new URL(window.location.href);
    url.hash = `calendar:${dateSlug}`;
    const text = url.toString();

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          notify("Session link copied to clipboard", "info");
        })
        .catch(() => {
          const fallback = window.prompt("Copy this link", text);
          if (fallback !== null) {
            notify("Session link ready to share", "info");
          }
        });
    } else {
      const fallback = window.prompt("Copy this link", text);
      if (fallback !== null) {
        notify("Session link ready to share", "info");
      }
    }
  }

  function startEditing(event) {
    editingEventId = event.id;
    formHeading.textContent = "Edit session";
    submitButton.textContent = "Update session";
    cancelButton.hidden = false;
    titleInput.value = event.title || "Ossett U8s Training";
    const referenceDate = event.startDate || event.endDate;
    if (referenceDate) {
      dateInput.value = formatInputDate(referenceDate);
    }
    if (event.startDate) {
      startInput.value = formatInputTime(event.startDate);
    }
    if (event.endDate) {
      endInput.value = formatInputTime(event.endDate);
    }
    locationInput.value = event.location || "";
    notesInput.value = event.notes || "";
    window.requestAnimationFrame(() => {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function confirmDelete(event) {
    const dateLabel = formatDateLabel(event.startDate || event.endDate);
    const confirmed = window.confirm(`Delete \"${event.title || "Ossett U8s Training"}\" on ${dateLabel}? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }
    deleteEvent(event.id);
  }

  async function deleteEvent(eventId) {
    if (!eventId) return;
    try {
      await deleteEventRecord(eventId);
      notify("Session deleted", "info");
    } catch (error) {
      console.error(error);
      notify("Failed to delete session", "error");
    }
  }

  function renderView() {
    const isActive = window.location.hash === "#manage";
    manageSection.hidden = !isActive;

    if (isActive) {
      manageNav.setAttribute("aria-current", "page");
    } else {
      manageNav.removeAttribute("aria-current");
    }

    if (!isActive) {
      return;
    }

    if (isCheckingAccess) {
      setStateMessage("Checking access…", "info");
      form.hidden = true;
      listSection.hidden = true;
      return;
    }

    if (!currentUser) {
      setStateMessage("Sign in to manage training sessions.", "error");
      form.hidden = true;
      listSection.hidden = true;
      return;
    }

    if (!isAllowed) {
      setStateMessage("Access required. Ask an admin to enable manage permissions.", "error");
      form.hidden = true;
      listSection.hidden = true;
      return;
    }

    const name = currentUser.displayName || currentUser.email || "coach";
    const roleLabel = currentRole?.role || (isAdmin ? "admin" : "coach");
    setStateMessage(`Signed in as ${name}. You have ${roleLabel} access.`, "info");
    form.hidden = false;
    listSection.hidden = false;
    renderEventsTable();
  }

  function startEventsListener() {
    if (unsubscribeFromEvents) {
      return;
    }
    isLoadingEvents = true;
    renderEventsTable();
    unsubscribeFromEvents = listenToEvents((records) => {
      isLoadingEvents = false;
      events = records.map(normalizeEvent);
      renderEventsTable();
    });
  }

  function stopEventsListener() {
    if (unsubscribeFromEvents) {
      unsubscribeFromEvents();
      unsubscribeFromEvents = null;
    }
    events = [];
    isLoadingEvents = false;
    renderEventsTable();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isAllowed || !currentUser) {
      notify("You do not have permission to manage sessions.", "error");
      return;
    }

    const title = titleInput.value.trim() || "Ossett U8s Training";
    const dateValue = dateInput.value;
    const startValue = startInput.value;
    const endValue = endInput.value;
    const location = locationInput.value.trim();
    const notes = notesInput.value.trim();

    const startDate = combineDateAndTime(dateValue, startValue);
    const endDate = combineDateAndTime(dateValue, endValue);

    if (!startDate || !endDate) {
      notify("Enter a valid date and time range.", "error");
      return;
    }

    if (endDate <= startDate) {
      notify("End time must be after the start time.", "error");
      return;
    }

    const payload = {
      title,
      start: startDate,
      end: endDate,
      location,
      notes,
    };

    setLoading(true);

    try {
      if (editingEventId) {
        await updateEventRecord(editingEventId, payload);
        notify("Session updated", "info");
      } else {
        await createEvent({ ...payload, createdBy: currentUser.uid });
        notify("Session created", "info");
      }
      resetForm();
    } catch (error) {
      console.error(error);
      notify("Unable to save the session", "error");
    } finally {
      setLoading(false);
    }
  }

  cancelButton.addEventListener("click", () => {
    resetForm();
  });

  form.addEventListener("submit", handleSubmit);

  function handleNavClick(event) {
    if (window.location.hash === "#manage") {
      event.preventDefault();
      history.pushState("", document.title, window.location.pathname + window.location.search);
      renderView();
    }
  }

  manageNav.addEventListener("click", handleNavClick);
  window.addEventListener("hashchange", renderView);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    editingEventId = null;
    resetForm();

    if (!user) {
      currentRole = null;
      isAdmin = false;
      isAllowed = false;
      isCheckingAccess = false;
      stopEventsListener();
      renderView();
      return;
    }

    isCheckingAccess = true;
    renderView();

    const role = await getUserRole(user.uid);
    currentRole = role;
    const roleName = role?.role || null;
    isAdmin = roleName === "admin";
    isAllowed = ALLOWED_ROLES.has(roleName);

    if (isAllowed) {
      startEventsListener();
    } else {
      stopEventsListener();
    }

    isCheckingAccess = false;
    renderView();
  });

  renderView();
}
