import { initCalendar, onEventSelected } from "./calendar.js";

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
let toastEl;
let summaryContainer;
let summaryList;
let summaryPlaceholder;
let toastHideTimer;
let toastDelayTimer;

const MINUTE_IN_MS = 60 * 1000;

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
  toastEl = document.getElementById("toast");
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

function hideToast() {
  if (!toastEl) return;
  toastEl.classList.remove("toast-visible");
  if (toastHideTimer) {
    window.clearTimeout(toastHideTimer);
  }
  toastHideTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 220);
}

function showToast(message, tone = "success") {
  if (!toastEl) return;
  if (toastDelayTimer) {
    window.clearTimeout(toastDelayTimer);
  }
  if (toastHideTimer) {
    window.clearTimeout(toastHideTimer);
  }
  toastEl.textContent = message;
  toastEl.className = tone === "error" ? "toast toast--error" : "toast";
  toastEl.hidden = false;
  // Ensure the class change happens in a new frame for transition support.
  requestAnimationFrame(() => {
    toastEl.classList.add("toast-visible");
  });
  toastDelayTimer = window.setTimeout(hideToast, 4000);
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
  showToast("Training session saved");
  // eslint-disable-next-line no-console
  console.info("Normalised session payload", payload);
}

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();
  cacheFormElements();
  setDefaultFieldValues();

  try {
    onEventSelected((event) => {
      window.App?.ui?.renderEventDetails?.(event);
    });
    initCalendar();
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
