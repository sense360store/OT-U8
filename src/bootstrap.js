import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = window.__FIREBASE_CONFIG;
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
auth.useDeviceLanguage();
const db = getFirestore(firebaseApp);

window.app = { auth, db };

const storageKeys = {
  gate: "ot_u8_gate",
  theme: "ot_u8_theme",
  accent: "ot_u8_accent"
};

const gateDocRef = doc(db, "config", "access_gate");

const gateState = {
  hash: null,
  status: "loading",
  updatedAt: null,
  expiresAt: null,
  updatedBy: null,
  error: null,
};

const state = {
  user: null,
  allowed: false,
  blocked: false,
  isAdmin: false,
  events: [],
  selectedEventId: null,
  rsvpUnsub: null,
  eventsUnsub: null,
  currentRsvp: null
};

const calendarEl = document.getElementById("calendar");
const statusBody = document.getElementById("statusBody");
const authControls = document.getElementById("authControls");
const manageToggle = document.getElementById("manageToggle");
const managePanel = document.getElementById("managePanel");
const closeManage = document.getElementById("closeManage");
const eventForm = document.getElementById("eventForm");
const eventsTableBody = document.querySelector("#eventsTable tbody");
const eventsCards = document.getElementById("eventsCards");
const eventFormError = document.getElementById("eventFormError");
const detailsCard = document.getElementById("detailsCard");
const detailsDesktopHost = document.getElementById("detailsDesktopHost");
const detailsMobileHost = document.getElementById("detailsMobileHost");
const detailsSheet = document.getElementById("detailsSheet");
const detailsScrim = document.getElementById("detailsScrim");
const closeDetailsSheetBtn = document.getElementById("closeDetailsSheet");
const detailTitle = document.getElementById("detailTitle");
const detailWhen = document.getElementById("detailWhen");
const detailLocation = document.getElementById("detailLocation");
const detailNotes = document.getElementById("detailNotes");
const detailsSubtitle = document.getElementById("detailsSubtitle");
const rsvpForm = document.getElementById("rsvpForm");
const rsvpGroups = document.getElementById("rsvpGroups");
const quickAddDialog = document.getElementById("quickAddDialog");
const quickAddForm = document.getElementById("quickAddForm");
const quickAddScrim = document.getElementById("quickAddScrim");
const closeQuickAddBtn = document.getElementById("closeQuickAdd");
const quickCancelBtn = document.getElementById("quickCancel");
const quickTitleInput = document.getElementById("quickTitle");
const quickDateInput = document.getElementById("quickDate");
const quickStartInput = document.getElementById("quickStart");
const quickEndInput = document.getElementById("quickEnd");
const quickLocationInput = document.getElementById("quickLocation");
const quickNotesInput = document.getElementById("quickNotes");
const toastEl = document.getElementById("toast");
const yearEl = document.getElementById("year");
const themeToggle = document.getElementById("themeToggle");
const accentPicker = document.getElementById("accentPicker");
const mobileQuery = window.matchMedia("(max-width: 900px)");

let gateUnlocked = false;
let gateUnsubscribe = null;
let gateConfigReady = false;
let calendar;
let pendingQuickSelection = null;

function gateNeedsInitialSetup() {
  return (
    gateConfigReady &&
    gateState.status === "inactive" &&
    !gateState.hash &&
    !gateState.updatedAt &&
    !gateState.updatedBy
  );
}

function getStoredGateToken() {
  try {
    return window.localStorage.getItem(storageKeys.gate);
  } catch (error) {
    console.warn("Unable to read access gate token", error);
    return null;
  }
}

function setStoredGateToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(storageKeys.gate, token);
    } else {
      window.localStorage.removeItem(storageKeys.gate);
    }
  } catch (error) {
    console.warn("Unable to persist access gate token", error);
  }
}

function clearStoredGateToken() {
  setStoredGateToken(null);
}

function refreshGateUnlock() {
  const stored = getStoredGateToken();
  const activeHash = gateState.status === "active" && typeof gateState.hash === "string" && gateState.hash.length > 0;
  const matches = Boolean(stored && activeHash && stored === gateState.hash);
  gateUnlocked = matches;
  if (!matches && stored) {
    clearStoredGateToken();
  }
}

init();

function init() {
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  if (detailsSheet) {
    detailsSheet.hidden = true;
    detailsSheet.setAttribute("aria-hidden", "true");
  }
  if (quickAddDialog) {
    quickAddDialog.hidden = true;
  }

  initTheme();
  subscribeToAccessGate();
  renderAuthControls();
  renderStatus();
  updateDetailsHost();
  initCalendar();
  attachListeners();
  handleScreenChange(mobileQuery);

  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.allowed = false;
    state.blocked = false;
    state.currentRsvp = null;
    if (!user) {
      stopEventsListener();
      stopRsvpListener();
      renderAuthControls();
      renderStatus();
      updateManageToggle();
      showDetails(null);
      return;
    }

    await detectAdmin(user);
    renderAuthControls();
    renderStatus("checking");
    startEventsListener();
  });
}

function subscribeToAccessGate() {
  if (typeof gateUnsubscribe === "function") {
    gateUnsubscribe();
  }
  gateUnsubscribe = onSnapshot(
    gateDocRef,
    (snapshot) => {
      gateConfigReady = true;
      gateState.error = null;
      const data = snapshot.exists() ? snapshot.data() : {};
      const rawHash = typeof data.hash === "string" ? data.hash.trim() : "";
      let status = data.status || (rawHash ? "active" : "inactive");
      let expiresAt = data.expiresAt?.toDate?.() ?? null;
      if (expiresAt && expiresAt instanceof Date && expiresAt.getTime() <= Date.now()) {
        status = "expired";
      }
      gateState.hash = status === "active" && rawHash ? rawHash : null;
      gateState.status = status;
      gateState.updatedAt = data.updatedAt?.toDate?.() ?? null;
      gateState.expiresAt = status === "active" ? expiresAt : null;
      gateState.updatedBy = data.updatedByEmail || data.updatedBy || null;
      refreshGateUnlock();
      renderAuthControls();
      renderStatus();
    },
    (error) => {
      console.error("Access gate listener error", error);
      gateConfigReady = true;
      gateState.error = error;
      gateState.hash = null;
      gateState.status = "error";
      gateState.updatedAt = null;
      gateState.expiresAt = null;
      gateState.updatedBy = null;
      refreshGateUnlock();
      renderAuthControls();
      renderStatus();
    }
  );
}

function attachListeners() {
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }
  if (accentPicker) {
    const stored = window.localStorage.getItem(storageKeys.accent);
    if (stored) {
      applyAccent(stored);
      accentPicker.value = stored;
    }
    accentPicker.addEventListener("input", (event) => {
      const colour = event.target.value;
      applyAccent(colour);
      window.localStorage.setItem(storageKeys.accent, colour);
    });
  }
  if (rsvpForm) {
    rsvpForm.addEventListener("change", handleRsvpChange);
  }
  if (manageToggle) {
    manageToggle.addEventListener("click", () => {
      toggleManagePanel(true);
    });
  }
  if (closeManage) {
    closeManage.addEventListener("click", () => toggleManagePanel(false));
  }
  if (eventForm) {
    eventForm.addEventListener("submit", handleEventFormSubmit);
    eventForm.addEventListener("reset", () => {
      eventForm.dataset.editing = "";
      eventFormError.hidden = true;
      eventFormError.textContent = "";
    });
  }
  if (detailsScrim) {
    detailsScrim.addEventListener("click", closeDetailsSheet);
  }
  if (closeDetailsSheetBtn) {
    closeDetailsSheetBtn.addEventListener("click", closeDetailsSheet);
  }
  if (quickAddForm) {
    quickAddForm.addEventListener("submit", handleQuickAddSubmit);
  }
  if (quickAddScrim) {
    quickAddScrim.addEventListener("click", closeQuickAddDialog);
  }
  if (closeQuickAddBtn) {
    closeQuickAddBtn.addEventListener("click", closeQuickAddDialog);
  }
  if (quickCancelBtn) {
    quickCancelBtn.addEventListener("click", closeQuickAddDialog);
  }
  window.addEventListener("keydown", handleGlobalKeyDown);
  if (mobileQuery?.addEventListener) {
    mobileQuery.addEventListener("change", handleScreenChange);
  } else if (mobileQuery?.addListener) {
    mobileQuery.addListener(handleScreenChange);
  }
  window.addEventListener("hashchange", syncSelectedFromHash);
}

function initCalendar() {
  if (!calendarEl || !window.FullCalendar) return;
  const { Calendar } = window.FullCalendar;
  calendar = new Calendar(calendarEl, {
    initialView: mobileQuery.matches ? "listMonth" : "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listMonth"
    },
    buttonText: {
      today: "Today",
      dayGridMonth: "Month view",
      listMonth: "List view"
    },
    selectable: true,
    selectMirror: true,
    select: handleCalendarSelect,
    eventClick: (info) => {
      if (info.event.id) {
        selectEvent(info.event.id);
      }
    }
  });
  calendar.render();
  syncSelectedFromHash();
}

function handleCalendarSelect(selectionInfo) {
  calendar.unselect();
  if (!state.allowed || !state.user) {
    showToast("Sign in to add sessions.");
    return;
  }
  const start = new Date(selectionInfo.start);
  let end = new Date(selectionInfo.end || selectionInfo.start);
  if (selectionInfo.allDay) {
    start.setHours(18, 0, 0, 0);
    if (!selectionInfo.end) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    } else {
      end.setHours(19, 0, 0, 0);
    }
  }
  if (end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  pendingQuickSelection = { start, end };
  openQuickAddDialog();
}

function openQuickAddDialog() {
  if (!quickAddDialog || !quickAddForm) return;
  const selection = pendingQuickSelection || {
    start: new Date(),
    end: new Date(Date.now() + 60 * 60 * 1000)
  };
  quickAddForm.reset();
  if (quickTitleInput) {
    quickTitleInput.value = quickTitleInput.value || "Ossett U8s Training";
  }
  if (quickDateInput) {
    quickDateInput.value = formatDateInput(selection.start);
  }
  if (quickStartInput) {
    quickStartInput.value = formatTimeInput(selection.start);
  }
  if (quickEndInput) {
    quickEndInput.value = formatTimeInput(selection.end);
  }
  if (quickLocationInput) {
    quickLocationInput.value = "";
  }
  if (quickNotesInput) {
    quickNotesInput.value = "";
  }
  quickAddDialog.hidden = false;
  quickAddDialog.classList.add("is-open");
  document.body.classList.add("dialog-open");
  window.setTimeout(() => {
    quickTitleInput?.focus();
  }, 50);
}

function closeQuickAddDialog() {
  if (!quickAddDialog) return;
  quickAddDialog.classList.remove("is-open");
  quickAddDialog.hidden = true;
  document.body.classList.remove("dialog-open");
  pendingQuickSelection = null;
  quickAddForm?.reset();
}

async function handleQuickAddSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showToast("Sign in to add sessions.");
    return;
  }
  const formData = new FormData(quickAddForm);
  const title = (formData.get("title") || "Ossett U8s Training").toString().trim() || "Ossett U8s Training";
  const date = formData.get("date");
  const startTime = formData.get("start");
  const endTime = formData.get("end");
  const location = (formData.get("location") || "").toString().trim();
  const notes = (formData.get("notes") || "").toString().trim();

  const startDate = parseLocalDateTime(date, startTime);
  const endDate = parseLocalDateTime(date, endTime);

  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    showToast("Check the start and end times before saving.");
    return;
  }

  if (endDate <= startDate) {
    showToast("End time must be after the start time.");
    return;
  }

  try {
    await createEvent({ title, start: startDate, end: endDate, location, notes });
    closeQuickAddDialog();
  } catch (error) {
    console.error(error);
    showToast("Unable to save the session.");
  }
}

function handleGlobalKeyDown(event) {
  if (event.key !== "Escape") return;
  if (quickAddDialog && quickAddDialog.classList.contains("is-open")) {
    event.preventDefault();
    closeQuickAddDialog();
    return;
  }
  if (detailsSheet && detailsSheet.classList.contains("is-open")) {
    event.preventDefault();
    closeDetailsSheet();
  }
}

function handleScreenChange(event) {
  const matches = event.matches ?? mobileQuery.matches;
  updateDetailsHost();
  if (calendar) {
    const desiredView = matches ? "listMonth" : "dayGridMonth";
    if (calendar.view?.type !== desiredView) {
      calendar.changeView(desiredView);
    }
    calendar.updateSize();
  }
  if (!matches) {
    closeDetailsSheet();
  } else if (matches && state.selectedEventId && state.allowed) {
    const current = findEvent(state.selectedEventId);
    if (current) {
      showDetails(current);
    }
  }
  refreshEventsTable();
}

function updateDetailsHost() {
  if (!detailsCard) return;
  const target = mobileQuery.matches ? detailsMobileHost : detailsDesktopHost;
  if (target && detailsCard.parentElement !== target) {
    target.appendChild(detailsCard);
  }
  if (!mobileQuery.matches) {
    closeDetailsSheet();
  }
}

function openDetailsSheet() {
  if (!detailsSheet || !mobileQuery.matches) return;
  detailsSheet.hidden = false;
  detailsSheet.classList.add("is-open");
  detailsSheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");
  window.setTimeout(() => {
    closeDetailsSheetBtn?.focus();
  }, 50);
}

function closeDetailsSheet() {
  if (!detailsSheet) return;
  detailsSheet.classList.remove("is-open");
  detailsSheet.setAttribute("aria-hidden", "true");
  detailsSheet.hidden = true;
  document.body.classList.remove("sheet-open");
}

function syncSelectedFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith("#event=")) {
    const eventId = decodeURIComponent(hash.slice(7));
    if (eventId && eventId !== state.selectedEventId) {
      selectEvent(eventId);
    }
  }
}

function toggleManagePanel(show) {
  if (!managePanel) return;
  const shouldShow = show ?? managePanel.hasAttribute("hidden");
  if (shouldShow) {
    managePanel.removeAttribute("hidden");
    managePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    managePanel.setAttribute("hidden", "");
    eventForm?.reset();
  }
}

async function detectAdmin(user) {
  if (!user) {
    state.isAdmin = false;
    return;
  }
  try {
    const roleSnap = await getDoc(doc(db, "roles", user.uid));
    state.isAdmin = roleSnap.exists() && roleSnap.data().role === "admin";
  } catch (error) {
    state.isAdmin = false;
  }
}

function startEventsListener() {
  stopEventsListener();
  if (!state.user) return;
  const q = query(collection(db, "events"), orderBy("start", "asc"));
  state.eventsUnsub = onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      state.events = events;
      state.allowed = true;
      state.blocked = false;
      updateManageToggle();
      renderStatus();
      refreshCalendar();
      refreshEventsTable();
      if (!state.selectedEventId && events.length > 0) {
        const fromHash = extractEventIdFromHash();
        const eventId = fromHash || events[0].id;
        selectEvent(eventId);
      } else if (state.selectedEventId) {
        const exists = events.some((event) => event.id === state.selectedEventId);
        if (!exists) {
          selectEvent(events[0]?.id || null);
        } else {
          showDetails(findEvent(state.selectedEventId));
        }
      }
    },
    (error) => {
      console.error("Events listener error", error);
      state.allowed = false;
      if (error.code === "permission-denied") {
        state.blocked = true;
        renderStatus("blocked");
        updateManageToggle();
        refreshCalendar(true);
        refreshEventsTable();
        showDetails(null);
      } else {
        showToast("Unable to load sessions.");
      }
    }
  );
}

function stopEventsListener() {
  if (typeof state.eventsUnsub === "function") {
    state.eventsUnsub();
  }
  state.eventsUnsub = null;
  state.events = [];
  refreshCalendar(true);
  refreshEventsTable();
}

function refreshCalendar(clearOnly = false) {
  if (!calendar) return;
  calendar.removeAllEvents();
  if (clearOnly || !state.allowed) return;
  const source = state.events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start?.toDate ? event.start.toDate() : new Date(event.start),
    end: event.end?.toDate ? event.end.toDate() : new Date(event.end)
  }));
  source.forEach((evt) => calendar.addEvent(evt));
}

function refreshEventsTable() {
  if (eventsTableBody) {
    eventsTableBody.innerHTML = "";
  }
  if (eventsCards) {
    eventsCards.innerHTML = "";
    eventsCards.hidden = !mobileQuery.matches;
  }

  const emptyMessage = state.allowed ? "No upcoming sessions yet." : "Sign in to manage sessions.";

  if (!state.allowed || state.events.length === 0) {
    if (eventsTableBody) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = emptyMessage;
      row.appendChild(cell);
      eventsTableBody.appendChild(row);
    }
    if (eventsCards) {
      const card = document.createElement("div");
      card.className = "event-card";
      const text = document.createElement("p");
      text.className = "muted-text";
      text.textContent = emptyMessage;
      card.appendChild(text);
      eventsCards.appendChild(card);
    }
    return;
  }

  state.events.forEach((event) => {
    const startDate = event.start?.toDate ? event.start.toDate() : new Date(event.start);
    const endDate = event.end?.toDate ? event.end.toDate() : new Date(event.end);
    const canEdit = state.isAdmin || event.createdBy === state.user?.uid;

    if (eventsTableBody) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatDate(startDate)}</td>
        <td>${escapeHtml(event.title)}</td>
        <td>${escapeHtml(event.location || "")}</td>
        <td class="actions"></td>
      `;
      const actionsCell = row.querySelector(".actions");
      if (canEdit) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "button text";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => startEditEvent(event.id));
        actionsCell.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "button text";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => deleteEvent(event.id));
        actionsCell.appendChild(deleteBtn);
      } else {
        actionsCell.textContent = "—";
      }
      eventsTableBody.appendChild(row);
    }

    if (eventsCards) {
      const card = document.createElement("article");
      card.className = "event-card";
      const titleEl = document.createElement("h4");
      titleEl.textContent = event.title || "Untitled session";
      const meta = document.createElement("div");
      meta.className = "event-card__meta";

      const dateSpan = document.createElement("span");
      dateSpan.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>${formatDate(startDate)}`;
      meta.appendChild(dateSpan);

      const timeSpan = document.createElement("span");
      timeSpan.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">schedule</span>${formatTimeRange(startDate, endDate)}`;
      meta.appendChild(timeSpan);

      if (event.location) {
        const locationSpan = document.createElement("span");
        locationSpan.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">location_on</span>${escapeHtml(event.location)}`;
        meta.appendChild(locationSpan);
      }

      card.appendChild(titleEl);
      card.appendChild(meta);

      if (event.notes) {
        const notes = document.createElement("p");
        notes.className = "muted-text";
        notes.textContent = event.notes;
        card.appendChild(notes);
      }

      const actions = document.createElement("div");
      actions.className = "event-card__actions";
      if (canEdit) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "button tonal";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => startEditEvent(event.id));
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "button text";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => deleteEvent(event.id));
        actions.appendChild(deleteBtn);
      }
      if (actions.childElementCount > 0) {
        card.appendChild(actions);
      }

      eventsCards.appendChild(card);
    }
  });
}

function startEditEvent(eventId) {
  const event = findEvent(eventId);
  if (!event || !eventForm) return;
  toggleManagePanel(true);
  eventForm.dataset.editing = eventId;
  eventFormError.hidden = true;
  eventFormError.textContent = "";
  eventForm.querySelector("#eventTitle").value = event.title || "";
  const startDate = event.start?.toDate ? event.start.toDate() : new Date(event.start);
  const endDate = event.end?.toDate ? event.end.toDate() : new Date(event.end);
  eventForm.querySelector("#eventDate").value = formatDateInput(startDate);
  eventForm.querySelector("#eventStart").value = formatTimeInput(startDate);
  eventForm.querySelector("#eventEnd").value = formatTimeInput(endDate);
  eventForm.querySelector("#eventLocation").value = event.location || "";
  eventForm.querySelector("#eventNotes").value = event.notes || "";
}

async function deleteEvent(eventId) {
  if (!window.confirm("Delete this session?")) return;
  try {
    await deleteDoc(doc(db, "events", eventId));
    showToast("Session deleted.");
  } catch (error) {
    console.error(error);
    showToast("Unable to delete session.");
  }
}

async function handleEventFormSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showToast("Sign in to manage sessions.");
    return;
  }
  const formData = new FormData(eventForm);
  const title = (formData.get("title") || "").toString().trim();
  const date = formData.get("date");
  const startTime = formData.get("start");
  const endTime = formData.get("end");
  const location = (formData.get("location") || "").toString().trim();
  const notes = (formData.get("notes") || "").toString().trim();

  const startDate = parseLocalDateTime(date, startTime);
  const endDate = parseLocalDateTime(date, endTime);

  if (!title || !date || !startTime || !endTime || Number.isNaN(startDate?.getTime()) || Number.isNaN(endDate?.getTime())) {
    showFormError("Please complete all required fields.");
    return;
  }

  if (endDate <= startDate) {
    showFormError("End time must be after the start time.");
    return;
  }

  const payload = {
    title,
    start: Timestamp.fromDate(startDate),
    end: Timestamp.fromDate(endDate),
    location,
    notes,
    updatedAt: serverTimestamp()
  };

  try {
    const editingId = eventForm.dataset.editing;
    if (editingId) {
      await updateDoc(doc(db, "events", editingId), payload);
      showToast("Session updated.");
    } else {
      await addDoc(collection(db, "events"), {
        ...payload,
        createdBy: state.user.uid,
        createdAt: serverTimestamp()
      });
      showToast("Session created.");
    }
    eventForm.reset();
    eventForm.dataset.editing = "";
    eventFormError.hidden = true;
    eventFormError.textContent = "";
  } catch (error) {
    console.error(error);
    showFormError("Unable to save the session.");
  }
}

function showFormError(message) {
  eventFormError.textContent = message;
  eventFormError.hidden = false;
}

function selectEvent(eventId) {
  state.selectedEventId = eventId || null;
  if (!eventId) {
    showDetails(null);
    return;
  }
  const targetHash = `#event=${encodeURIComponent(eventId)}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
  const event = findEvent(eventId);
  showDetails(event);
  watchRsvps(eventId);
}

function findEvent(eventId) {
  return state.events.find((event) => event.id === eventId) || null;
}

function showDetails(event) {
  if (!detailsCard || !rsvpForm || !rsvpGroups) return;
  if (!event || !state.allowed) {
    detailsCard.setAttribute("hidden", "");
    rsvpForm.hidden = true;
    rsvpGroups.hidden = true;
    detailsSubtitle.textContent = state.allowed ? "Choose a session to see the plan." : "Sign in to view session details.";
    closeDetailsSheet();
    return;
  }
  detailsCard.removeAttribute("hidden");
  detailsSubtitle.textContent = formatDateRange(event.start, event.end);
  detailTitle.textContent = event.title || "Untitled session";
  detailWhen.textContent = formatDateRange(event.start, event.end);
  detailLocation.textContent = event.location ? event.location : "No location provided";
  detailNotes.textContent = event.notes ? event.notes : "No notes yet.";
  if (state.user) {
    rsvpForm.hidden = false;
    rsvpGroups.hidden = false;
    rsvpForm.reset();
  } else {
    rsvpForm.hidden = true;
    rsvpGroups.hidden = true;
  }
  if (mobileQuery.matches) {
    openDetailsSheet();
  } else {
    closeDetailsSheet();
  }
}

function watchRsvps(eventId) {
  stopRsvpListener();
  if (!eventId || !state.user || !state.allowed) return;
  const q = query(collection(db, "rsvps"), where("eventId", "==", eventId));
  state.rsvpUnsub = onSnapshot(
    q,
    (snapshot) => {
      const groups = { yes: [], maybe: [], no: [] };
      let current = null;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status && groups[data.status]) {
          groups[data.status].push(data);
        }
        if (data.uid === state.user?.uid) {
          current = data;
        }
      });
      state.currentRsvp = current;
      updateRsvpForm();
      renderRsvpGroups(groups);
    },
    (error) => {
      console.error("RSVP listener error", error);
    }
  );
}

function stopRsvpListener() {
  if (typeof state.rsvpUnsub === "function") {
    state.rsvpUnsub();
  }
  state.rsvpUnsub = null;
  state.currentRsvp = null;
  if (rsvpGroups) {
    rsvpGroups.innerHTML = "";
    rsvpGroups.hidden = true;
  }
  if (rsvpForm) {
    rsvpForm.hidden = true;
    rsvpForm.reset();
  }
}

function updateRsvpForm() {
  if (!state.currentRsvp) {
    rsvpForm.reset();
    return;
  }
  const value = state.currentRsvp.status;
  const radio = rsvpForm.querySelector(`input[value="${value}"]`);
  if (radio) {
    radio.checked = true;
  }
}

async function handleRsvpChange(event) {
  if (!event.target.matches("input[name='rsvp']")) return;
  const status = event.target.value;
  if (!state.selectedEventId || !state.user) return;
  try {
    await setDoc(
      doc(db, "rsvps", `${state.selectedEventId}_${state.user.uid}`),
      {
        eventId: state.selectedEventId,
        uid: state.user.uid,
        coachName: state.user.displayName || state.user.email || "Coach",
        status,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    showToast("RSVP saved.");
  } catch (error) {
    console.error(error);
    showToast("Unable to save RSVP.");
  }
}

function renderRsvpGroups(groups) {
  if (!rsvpGroups) return;
  const statuses = [
    { key: "yes", label: "Attending", icon: "check_circle" },
    { key: "maybe", label: "Maybe", icon: "help" },
    { key: "no", label: "Not attending", icon: "cancel" }
  ];
  rsvpGroups.innerHTML = "";
  statuses.forEach(({ key, label, icon }) => {
    const list = groups[key] || [];
    const section = document.createElement("div");
    section.className = "rsvp-group";
    const count = list.length;
    section.innerHTML = `
      <h3><span class="material-symbols-rounded" aria-hidden="true">${icon}</span> ${label} (${count})</h3>
    `;
    const ul = document.createElement("ul");
    ul.className = "rsvp-list";
    if (count === 0) {
      const empty = document.createElement("p");
      empty.className = "rsvp-empty";
      empty.textContent = "No responses yet.";
      section.appendChild(empty);
    } else {
      list
        .sort((a, b) => (a.coachName || "").localeCompare(b.coachName || ""))
        .forEach((entry) => {
          const item = document.createElement("li");
          item.textContent = entry.coachName || entry.uid;
          ul.appendChild(item);
        });
      section.appendChild(ul);
    }
    rsvpGroups.appendChild(section);
  });
  rsvpGroups.hidden = false;
}

function getGateMetaText() {
  const segments = [];
  const updatedAt = formatDateTime(gateState.updatedAt);
  if (updatedAt) {
    segments.push(`Updated ${updatedAt}`);
  }
  if (gateState.updatedBy) {
    segments.push(`by ${gateState.updatedBy}`);
  }
  const expiresAt = gateState.status === "active" ? formatDateTime(gateState.expiresAt) : null;
  if (expiresAt) {
    segments.push(`Expires ${expiresAt}`);
  }
  return segments.join(" • ");
}

function appendGateDetails(container) {
  const metaText = getGateMetaText();
  if (!metaText) {
    return;
  }
  const meta = document.createElement("p");
  meta.className = "muted-text";
  meta.textContent = metaText;
  container.appendChild(meta);
}

function renderAuthControls() {
  if (!authControls) return;
  authControls.innerHTML = "";
  const requiresGate = !gateUnlocked && !state.user;
  const gateUnconfigured = gateNeedsInitialSetup();

  if (requiresGate && !gateUnconfigured) {
    if (!gateConfigReady) {
      const loading = document.createElement("p");
      loading.className = "muted-text";
      loading.textContent = "Loading access gate…";
      authControls.appendChild(loading);
      return;
    }

    if (gateState.error) {
      const error = document.createElement("p");
      error.className = "muted-text";
      error.textContent = "Unable to verify the access gate. Try again later.";
      authControls.appendChild(error);
      return;
    }

    if (gateState.status !== "active" || !gateState.hash) {
      const message = document.createElement("p");
      message.className = "muted-text";
      message.textContent =
        gateState.status === "expired"
          ? "The previous access code has expired. Contact an admin for a new code."
          : "An access code hasn't been configured yet. Contact an admin.";
      authControls.appendChild(message);
      appendGateDetails(authControls);
      return;
    }

    const form = document.createElement("form");
    form.className = "gate-form";
    form.innerHTML = `
      <label class="field">
        <span>Enter access code</span>
        <input type="password" name="code" autocomplete="off" required placeholder="Access code">
      </label>
      <button type="submit" class="button filled">
        <span class="material-symbols-rounded" aria-hidden="true">lock_open</span>
        Unlock
      </button>
    `;
    const input = form.querySelector("input[name='code']");
    const submitButton = form.querySelector("button[type='submit']");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!input || !submitButton) return;
      const value = input.value.trim();
      if (!value) {
        return;
      }
      if (!gateState.hash || gateState.status !== "active") {
        showToast("Access gate unavailable. Try again shortly.");
        return;
      }
      submitButton.disabled = true;
      input.disabled = true;
      try {
        const hash = await sha256(value);
        if (hash === gateState.hash) {
          setStoredGateToken(gateState.hash);
          refreshGateUnlock();
          showToast("Access unlocked. You can now sign in.");
          renderAuthControls();
          renderStatus();
        } else {
          showToast("Incorrect access code.");
        }
      } catch (error) {
        console.error(error);
        showToast("Unable to verify the code.");
      } finally {
        form.reset();
        submitButton.disabled = false;
        input.disabled = false;
        if (!gateUnlocked) {
          input.focus();
        }
      }
    });
    authControls.appendChild(form);

    const hint = document.createElement("p");
    hint.className = "muted-text";
    hint.textContent = "Ask the head coach for the latest code.";
    authControls.appendChild(hint);
    appendGateDetails(authControls);
    return;
  }

  if (!state.user) {
    if (requiresGate && gateUnconfigured) {
      const info = document.createElement("p");
      info.className = "muted-text";
      info.innerHTML =
        "<strong>No access code yet.</strong> Sign in to finish setup and generate the first code.";
      authControls.appendChild(info);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button filled";
    button.innerHTML = `
      <span class="material-symbols-rounded" aria-hidden="true">account_circle</span>
      Sign in with Google
    `;
    button.addEventListener("click", () => {
      const provider = new GoogleAuthProvider();
      signInWithPopup(auth, provider).catch((error) => {
        console.error(error);
        showToast("Sign-in cancelled.");
      });
    });
    authControls.appendChild(button);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "signed-in";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = (state.user.displayName || state.user.email || "Coach").slice(0, 2).toUpperCase();
  const info = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = state.user.displayName || "Signed in";
  const email = document.createElement("small");
  email.textContent = state.user.email || "";
  info.appendChild(name);
  info.appendChild(email);
  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "button text";
  signOutBtn.innerHTML = `
    <span class="material-symbols-rounded" aria-hidden="true">logout</span>
    Sign out
  `;
  signOutBtn.addEventListener("click", () => signOut(auth));
  wrapper.appendChild(avatar);
  wrapper.appendChild(info);
  wrapper.appendChild(signOutBtn);
  authControls.appendChild(wrapper);
}

function renderStatus(mode) {
  if (!statusBody) return;
  statusBody.innerHTML = "";
  const requiresGate = !gateUnlocked && !state.user;
  const gateUnconfigured = gateNeedsInitialSetup();

  if (!gateConfigReady) {
    statusBody.innerHTML = "<p class='muted-text'>Loading access gate…</p>";
    return;
  }

  if (gateState.error) {
    statusBody.innerHTML = "<p class='muted-text'>Unable to check the access gate right now. Try again shortly.</p>";
    return;
  }

  if (requiresGate) {
    const message = document.createElement("p");
    message.className = "muted-text";
    if (gateUnconfigured) {
      message.innerHTML =
        "<strong>Initial setup.</strong> Sign in to capture your account and configure the first access code.";
    } else if (gateState.status === "expired") {
      message.textContent = "The previous access code has expired. Contact an admin for a new code.";
    } else if (gateState.status !== "active" || !gateState.hash) {
      message.textContent = "An access code hasn't been configured yet. Contact an admin.";
    } else {
      message.textContent = "Enter the access code to unlock sign-in.";
    }
    statusBody.appendChild(message);
    appendGateDetails(statusBody);
    return;
  }

  if (!state.user) {
    statusBody.innerHTML = "<p class='muted-text'>Sign in with Google to view the training calendar.</p>";
    return;
  }
  if (state.blocked) {
    renderAccessRequest();
    return;
  }
  if (!state.allowed) {
    statusBody.innerHTML = "<p class='muted-text'>Checking your permissions…</p>";
    return;
  }
  const message = document.createElement("p");
  message.className = "muted-text";
  const role = state.isAdmin ? "admin" : "coach";
  message.textContent = `You're signed in as ${state.user.displayName || state.user.email || "a coach"}. Access level: ${role}.`;
  statusBody.appendChild(message);
}

function renderAccessRequest() {
  if (!state.user) return;
  statusBody.innerHTML = "";
  const title = document.createElement("p");
  title.innerHTML = "<strong>Access required.</strong> Your Google account hasn't been allowlisted yet.";
  const form = document.createElement("form");
  form.className = "access-request";
  form.innerHTML = `
    <label class="field">
      <span>Tell us who you coach for</span>
      <textarea name="message" placeholder="Include squad role or connection to Ossett Town Juniors"></textarea>
    </label>
    <button type="submit" class="button filled">
      <span class="material-symbols-rounded" aria-hidden="true">send</span>
      Request access
    </button>
  `;
  const hint = document.createElement("p");
  hint.className = "muted-text";
  hint.textContent = "We'll notify the admins and email you once approved.";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const message = (formData.get("message") || "").toString();
    try {
      await setDoc(doc(db, "access_requests", state.user.uid), {
        email: state.user.email || "",
        displayName: state.user.displayName || "",
        message,
        requestedAt: serverTimestamp()
      }, { merge: true });
      showToast("Access request sent.");
    } catch (error) {
      console.error(error);
      showToast("Unable to send request.");
    }
  });
  statusBody.appendChild(title);
  statusBody.appendChild(form);
  statusBody.appendChild(hint);
}

function updateManageToggle() {
  if (!manageToggle) return;
  if (state.allowed && state.user) {
    manageToggle.hidden = false;
  } else {
    manageToggle.hidden = true;
  }
}

function extractEventIdFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith("#event=")) {
    return decodeURIComponent(hash.slice(7));
  }
  return null;
}

async function createEvent({ title, start, end, location, notes }) {
  if (!state.user) throw new Error("Not signed in");
  if (!(start instanceof Date)) start = new Date(start);
  if (!(end instanceof Date)) end = new Date(end);
  if (end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  const payload = {
    title: title || "Ossett U8s Training",
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
    location: location || "",
    notes: notes || "",
    createdBy: state.user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await addDoc(collection(db, "events"), payload);
  showToast("Session created.");
}

function formatDateTime(date) {
  const value = date instanceof Date ? date : date?.toDate?.() ?? new Date(date);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDate(date) {
  const d = date instanceof Date ? date : date?.toDate?.() ?? new Date(date);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
}

function formatTimeRange(start, end) {
  const startDate = start instanceof Date ? start : start?.toDate?.() ?? new Date(start);
  const endDate = end instanceof Date ? end : end?.toDate?.() ?? new Date(end);
  if (Number.isNaN(startDate?.getTime()) || Number.isNaN(endDate?.getTime())) {
    return "Time to be confirmed";
  }
  const formatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

function formatDateRange(start, end) {
  const startDate = start?.toDate ? start.toDate() : new Date(start);
  const endDate = end?.toDate ? end.toDate() : new Date(end);
  if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
    return "Date to be confirmed";
  }
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
  const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${dateFormatter.format(startDate)} • ${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`;
  }
  return `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)} – ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeInput(date) {
  return date.toISOString().slice(11, 16);
}

function parseLocalDateTime(date, time) {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const dt = new Date();
  dt.setFullYear(year, month - 1, day);
  dt.setHours(hour, minute, 0, 0);
  return dt;
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add("show");
  window.setTimeout(() => {
    toastEl.classList.remove("show");
    toastEl.hidden = true;
  }, 3200);
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  if (next === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  window.localStorage.setItem(storageKeys.theme, next);
  themeToggle.querySelector(".material-symbols-rounded").textContent = next === "dark" ? "light_mode" : "dark_mode";
}

function initTheme() {
  const root = document.documentElement;
  const stored = window.localStorage.getItem(storageKeys.theme);
  if (stored === "dark") {
    root.setAttribute("data-theme", "dark");
  } else if (stored === "light") {
    root.removeAttribute("data-theme");
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.setAttribute("data-theme", "dark");
  }
  if (themeToggle) {
    const isDark = root.getAttribute("data-theme") === "dark";
    themeToggle.querySelector(".material-symbols-rounded").textContent = isDark ? "light_mode" : "dark_mode";
  }
}

function applyAccent(colour) {
  if (!colour) return;
  document.documentElement.style.setProperty("--accent", colour);
  const onColour = getReadableOnColour(colour);
  document.documentElement.style.setProperty("--accent-on", onColour);
}

function getReadableOnColour(hexColour) {
  const hex = hexColour.replace("#", "");
  const bigint = parseInt(hex, 16);
  if (Number.isNaN(bigint)) return "#ffffff";
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1d1b20" : "#ffffff";
}

function escapeHtml(value) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
