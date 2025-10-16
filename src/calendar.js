let calendarInstance;
let onEventSelected;
let currentView = "dayGridMonth";

function initCalendar({ onSelect } = {}) {
  onEventSelected = onSelect;
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) {
    throw new Error("Calendar element not found");
  }

  calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: currentView,
    height: "auto",
    selectable: false,
    displayEventTime: true,
    nowIndicator: true,
    dayMaxEventRows: true,
    eventClick(info) {
      info.jsEvent.preventDefault();
      setActiveEvent(info.event.id);
      if (typeof onEventSelected === "function") {
        onEventSelected(info.event.extendedProps.rawEvent);
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
  calendarInstance.removeAllEvents();
  events.forEach((event) => {
    calendarInstance.addEvent({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      extendedProps: { rawEvent: event },
    });
  });
}

function setActiveEvent(eventId) {
  if (!calendarInstance) return;
  calendarInstance.getEvents().forEach((event) => {
    const isActive = event.id === eventId;
    event.setProp("backgroundColor", isActive ? "#dbeafe" : "");
    event.setProp("borderColor", isActive ? "#1d4ed8" : "");
  });
}

window.App = window.App || {};
window.App.calendar = {
  initCalendar,
  setEvents,
  setActiveEvent,
};

export { initCalendar, setEvents, setActiveEvent };
