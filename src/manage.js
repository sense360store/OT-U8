const manageRoot = document.getElementById("manage-view");
const eventsContainer = manageRoot?.querySelector("[data-manage-events]");
const noteEl = manageRoot?.querySelector("[data-manage-note]");
const filterButtons = manageRoot?.querySelectorAll("[data-filter]");

let handlers = {};
let editingEventId = null;
let lastRenderState = null;
let inputIdCounter = 0;

function initManage(providedHandlers = {}) {
  handlers = providedHandlers;
  filterButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      if (!filter || filter === lastRenderState?.filter) {
        return;
      }
      handlers.onFilterChange?.(filter);
    });
  });
}

function renderManage(state = {}) {
  if (!manageRoot || !eventsContainer) {
    return;
  }
  lastRenderState = state;

  const { events = [], filter = "all", isAdmin = false, user = null } = state;

  updateFilterButtons(filter);
  updateNote({ isAdmin, user });

  if (editingEventId && !events.some((event) => event.id === editingEventId)) {
    editingEventId = null;
  }

  eventsContainer.innerHTML = "";

  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = filter === "mine" ? "No events created by you yet." : "No events scheduled.";
    eventsContainer.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  events
    .slice()
    .sort((a, b) => {
      const timeA = getDateValue(a.start)?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
      const timeB = getDateValue(b.start)?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    })
    .forEach((event) => {
      const card = createEventCard(event, { isAdmin, user });
      fragment.appendChild(card);
    });

  eventsContainer.appendChild(fragment);
}

function updateFilterButtons(activeFilter) {
  filterButtons?.forEach((button) => {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.disabled = isActive;
  });
}

function updateNote({ isAdmin, user }) {
  if (!noteEl) return;
  if (!user) {
    noteEl.textContent = "Sign in to manage training events.";
    return;
  }
  if (!isAdmin) {
    noteEl.textContent = "Viewing events. Contact an admin if you need edit access.";
    return;
  }
  noteEl.textContent = "Admins can edit details inline. Changes are saved instantly.";
}

function createEventCard(event, { isAdmin, user }) {
  const card = document.createElement("article");
  card.className = "manage-event";

  const isEditing = isAdmin && editingEventId === event.id;

  if (isEditing) {
    card.appendChild(createEventForm(event));
    return card;
  }

  const header = document.createElement("header");
  header.className = "manage-event-header";

  const title = document.createElement("h3");
  title.textContent = event.title || "Untitled event";
  header.appendChild(title);

  if (isAdmin) {
    const actions = document.createElement("div");
    actions.className = "manage-event-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button-secondary";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      editingEventId = event.id;
      rerender();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button-danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm("Delete this event? This cannot be undone.")) {
        return;
      }
      const result = handlers.onDelete?.(event.id, event) ?? null;
      if (result && typeof result.then === "function") {
        deleteButton.disabled = true;
        result.catch(() => {}).finally(() => {
          deleteButton.disabled = false;
        });
      }
    });

    actions.append(editButton, deleteButton);
    header.appendChild(actions);
  }

  card.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "manage-event-meta";

  const dateLine = document.createElement("p");
  dateLine.textContent = formatDateRange(event.start, event.end);
  meta.appendChild(dateLine);

  if (event.location) {
    const locationLine = document.createElement("p");
    locationLine.textContent = `Location: ${event.location}`;
    meta.appendChild(locationLine);
  }

  if (event.notes) {
    const notesLine = document.createElement("p");
    notesLine.textContent = event.notes;
    meta.appendChild(notesLine);
  }

  card.appendChild(meta);

  if (event.createdBy) {
    const created = document.createElement("p");
    created.className = "placeholder";
    const createdByYou = user?.uid && event.createdBy === user.uid;
    created.textContent = createdByYou ? "Created by you" : `Created by: ${event.createdBy}`;
    card.appendChild(created);
  }

  return card;
}

function createEventForm(event) {
  const form = document.createElement("form");
  form.className = "manage-event-form";
  form.addEventListener("submit", (eventSubmit) => {
    eventSubmit.preventDefault();
    handleSave(form, event);
  });

  const grid = document.createElement("div");
  grid.className = "manage-form-grid";

  grid.appendChild(createInputField({
    label: "Title",
    name: "title",
    type: "text",
    value: event.title || "",
    required: true,
  }));

  grid.appendChild(createInputField({
    label: "Start",
    name: "start",
    type: "datetime-local",
    value: toDateInputValue(event.start),
    required: true,
  }));

  grid.appendChild(createInputField({
    label: "End",
    name: "end",
    type: "datetime-local",
    value: toDateInputValue(event.end),
  }));

  grid.appendChild(createInputField({
    label: "Location",
    name: "location",
    type: "text",
    value: event.location || "",
    placeholder: "Pitch or venue",
  }));

  form.appendChild(grid);

  form.appendChild(createTextareaField({
    label: "Notes",
    name: "notes",
    value: event.notes || "",
    placeholder: "Warm-up plan, kit reminders, or links",
  }));

  const footer = document.createElement("div");
  footer.className = "manage-event-footer";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button button-secondary";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    editingEventId = null;
    rerender();
  });

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "button";
  save.textContent = "Save changes";

  footer.append(cancel, save);
  form.appendChild(footer);

  return form;
}

function handleSave(form, event) {
  const formData = new FormData(form);

  const title = formData.get("title").trim();
  const startValue = formData.get("start");
  const endValue = formData.get("end");
  const location = formData.get("location").trim();
  const notes = formData.get("notes").trim();

  if (!title) {
    window.App?.ui?.showToast?.("Title is required", { tone: "error" });
    return;
  }

  const start = parseDateValue(startValue);
  if (!start) {
    window.App?.ui?.showToast?.("Start date is required", { tone: "error" });
    return;
  }

  const end = parseDateValue(endValue);
  if (end && end < start) {
    window.App?.ui?.showToast?.("End time must be after the start", { tone: "error" });
    return;
  }

  const payload = {
    title,
    start,
    end: end || null,
    location,
    notes,
  };

  const result = handlers.onUpdate?.(event.id, payload, event) ?? null;
  if (result && typeof result.then === "function") {
    setFormBusy(form, true);
    result
      .then(() => {
        editingEventId = null;
      })
      .catch(() => {})
      .finally(() => {
        setFormBusy(form, false);
        rerender();
      });
  } else {
    editingEventId = null;
    rerender();
  }
}

function setFormBusy(form, isBusy) {
  [...form.elements].forEach((element) => {
    element.disabled = isBusy;
  });
}

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function createInputField({ label, name, type, value, required = false, placeholder = "" }) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-field";

  const fieldLabel = document.createElement("label");
  const id = `${name}-${++inputIdCounter}`;
  fieldLabel.setAttribute("for", id);
  fieldLabel.textContent = label;

  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.id = id;
  input.value = value || "";
  input.required = required;
  if (placeholder) {
    input.placeholder = placeholder;
  }

  wrapper.append(fieldLabel, input);
  return wrapper;
}

function createTextareaField({ label, name, value, placeholder = "" }) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-field";

  const fieldLabel = document.createElement("label");
  const id = `${name}-${++inputIdCounter}`;
  fieldLabel.setAttribute("for", id);
  fieldLabel.textContent = label;

  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.id = id;
  textarea.value = value || "";
  if (placeholder) {
    textarea.placeholder = placeholder;
  }

  wrapper.append(fieldLabel, textarea);
  return wrapper;
}

function toDateInputValue(value) {
  const date = getDateValue(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatDateRange(start, end) {
  const startDate = getDateValue(start);
  if (!startDate) {
    return "Date to be confirmed";
  }
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const startLabel = formatter.format(startDate);
  if (!end) {
    return startLabel;
  }
  const endDate = getDateValue(end);
  if (!endDate) {
    return startLabel;
  }
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
    return `${startLabel} – ${timeFormatter.format(endDate)}`;
  }
  return `${startLabel} – ${formatter.format(endDate)}`;
}

function rerender() {
  if (!lastRenderState) return;
  renderManage(lastRenderState);
}

window.App = window.App || {};
window.App.manage = {
  initManage,
  renderManage,
};

export { initManage, renderManage };
