import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

let calendarInstance;
let unsubscribeEvents;
let eventSelectedCallback;
let eventsChangedCallback;
let currentView = "dayGridMonth";
let selectedEventId = null;
let cachedEvents = [];

function initCalendar() {
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
    selectable: false,
    displayEventTime: true,
    nowIndicator: true,
    dayMaxEventRows: true,
    headerToolbar: {
      start: "title",
      center: "",
      end: "today prev,next",
    },
    eventClick(info) {
      info.jsEvent.preventDefault();
      selectedEventId = info.event.id;
      setActiveEvent(selectedEventId);
      const rawEvent = info.event.extendedProps?.rawEvent;
      if (typeof eventSelectedCallback === "function" && rawEvent) {
        eventSelectedCallback(rawEvent);
      }
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

function setActiveEvent(eventId) {
  if (!calendarInstance) return;
  selectedEventId = eventId;
  calendarInstance.getEvents().forEach((event) => {
    const isActive = event.id === eventId;
    event.setProp("backgroundColor", isActive ? "#dbeafe" : "");
    event.setProp("borderColor", isActive ? "#1d4ed8" : "");
  });
}

function onEventSelected(callback) {
  eventSelectedCallback = callback;
}

function onEventsChanged(callback) {
  eventsChangedCallback = callback;
  if (cachedEvents.length && typeof callback === "function") {
    callback([...cachedEvents]);
  }
}

window.App = window.App || {};
window.App.calendar = {
  initCalendar,
  setActiveEvent,
  onEventSelected,
  onEventsChanged,
};

export { initCalendar, setActiveEvent, onEventSelected, onEventsChanged };
