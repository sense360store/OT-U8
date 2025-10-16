const STORAGE_KEY = "ot_u8_training_hub_state_v1";
const ISO_DATE_OPTIONS = { weekday: "short", month: "short", day: "numeric" };
const ISO_TIME_OPTIONS = { hour: "2-digit", minute: "2-digit" };

const clone = (value) => (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

const defaultState = {
  users: [
    {
      id: "manager-1",
      name: "Sam Manager",
      email: "sam.manager@ossett-town.co.uk",
      password: "coach",
      role: "manager",
      contact: "07700 900123",
    },
    {
      id: "coach-1",
      name: "Alex Coach",
      email: "alex.coach@ossett-town.co.uk",
      password: "coach",
      role: "coach",
      contact: "alex.coach@ossett-town.co.uk",
    },
    {
      id: "coach-2",
      name: "Jamie Assistant",
      email: "jamie.assistant@ossett-town.co.uk",
      password: "coach",
      role: "coach",
      contact: "07700 901234",
    },
  ],
  sessions: [],
  rsvps: {},
  notifications: [],
  selectedSessionId: null,
  currentUserId: null,
};

let state = loadState();
ensureSeedSessions();

let calendar;

const elements = {
  year: document.getElementById("year"),
  authArea: document.getElementById("authArea"),
  profileCard: document.getElementById("profileCard"),
  notificationCard: document.getElementById("notificationCard"),
  sessionSummary: document.getElementById("sessionSummary"),
  manageCard: document.getElementById("manageCard"),
  calendar: document.getElementById("calendar"),
  viewToggle: document.querySelectorAll(".view-toggle button"),
};

init();

function init() {
  if (elements.year) {
    elements.year.textContent = new Date().getFullYear();
  }
  initCalendar();
  attachViewToggle();
  render();
}

function loadState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return clone(defaultState);
    }
    const parsed = JSON.parse(stored);
    return {
      ...clone(defaultState),
      ...parsed,
      users: parsed.users?.length ? parsed.users : clone(defaultState.users),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      rsvps: parsed.rsvps || {},
      notifications: parsed.notifications || [],
    };
  } catch (error) {
    console.warn("Unable to read stored state", error);
    return clone(defaultState);
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save state", error);
  }
}

function ensureSeedSessions() {
  if (state.sessions.length) {
    state.sessions.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return;
  }
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 30, 0, 0);
  const sessions = [
    {
      title: "Passing & Possession",
      location: "Ingfield Training Ground",
      notes: "Focus on quick ball movement and calling for passes.",
      start: addDays(baseDate, 2),
      end: addMinutes(addDays(baseDate, 2), 75),
    },
    {
      title: "Defence Shape",
      location: "Ingfield Training Ground",
      notes: "Introduce pressing triggers and 1v1 defending.",
      start: addDays(baseDate, 5),
      end: addMinutes(addDays(baseDate, 5), 75),
    },
    {
      title: "Finishing Drills",
      location: "Ossett Leisure Centre",
      notes: "Stations for volleys, long-range shots, and composure in the box.",
      start: addDays(baseDate, 9),
      end: addMinutes(addDays(baseDate, 9), 60),
    },
  ];

  const manager = getManagers()[0];
  sessions.forEach((session) => {
    createSession({
      title: session.title,
      date: formatDateInput(session.start),
      startTime: formatTimeInput(session.start),
      endTime: formatTimeInput(session.end),
      location: session.location,
      notes: session.notes,
    }, manager, { silent: true });
  });
}

function initCalendar() {
  if (!elements.calendar) return;
  calendar = new FullCalendar.Calendar(elements.calendar, {
    initialView: "dayGridMonth",
    height: "auto",
    selectable: false,
    events: [],
    eventClick(info) {
      info.jsEvent?.preventDefault?.();
      setSelectedSession(info.event.id);
    },
  });
  calendar.render();
  syncCalendarEvents();
}

function attachViewToggle() {
  elements.viewToggle.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (!calendar || !view) return;
      calendar.changeView(view);
      elements.viewToggle.forEach((btn) => {
        btn.setAttribute("aria-pressed", btn === button ? "true" : "false");
      });
    });
  });
}

function syncCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents();
  state.sessions.forEach((session) => {
    calendar.addEvent({
      id: session.id,
      title: session.title,
      start: session.start,
      end: session.end,
      backgroundColor: "#e63946",
      borderColor: "#e63946",
      textColor: "#fff",
    });
  });
}

function render() {
  saveState();
  renderAuthArea();
  renderProfileCard();
  renderNotifications();
  renderSessions();
  renderManageCard();
  syncCalendarEvents();
}

function renderAuthArea() {
  const container = elements.authArea;
  if (!container) return;
  container.innerHTML = "";
  const user = getCurrentUser();

  if (!user) {
    const wrapper = document.createElement("div");
    wrapper.className = "auth-wrapper";

    const loginForm = document.createElement("form");
    loginForm.className = "form";
    loginForm.id = "loginForm";

    const loginTitle = document.createElement("h2");
    loginTitle.textContent = "Coach sign in";

    const emailField = createField({ label: "Email", type: "email", name: "email", required: true });
    const passwordField = createField({ label: "Password", type: "password", name: "password", required: true });

    const loginActions = document.createElement("div");
    loginActions.className = "form-actions";

    const loginButton = document.createElement("button");
    loginButton.type = "submit";
    loginButton.className = "button primary";
    loginButton.textContent = "Sign in";

    const switchToRegister = document.createElement("button");
    switchToRegister.type = "button";
    switchToRegister.className = "button outline";
    switchToRegister.textContent = "Create account";

    loginActions.append(loginButton, switchToRegister);
    loginForm.append(loginTitle, emailField, passwordField, loginActions);

    const registerForm = document.createElement("form");
    registerForm.className = "form";
    registerForm.id = "registerForm";
    registerForm.hidden = true;

    const registerTitle = document.createElement("h2");
    registerTitle.textContent = "Create an account";

    const nameField = createField({ label: "Full name", type: "text", name: "name", required: true });
    const regEmailField = createField({ label: "Email", type: "email", name: "email", required: true });
    const regPasswordField = createField({ label: "Password", type: "password", name: "password", required: true });

    const roleField = createField({ label: "Role", name: "role" });
    const roleSelect = document.createElement("select");
    roleSelect.name = "role";
    roleSelect.required = true;
    [
      { value: "coach", label: "Coach" },
      { value: "manager", label: "Manager" },
    ].forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      roleSelect.appendChild(opt);
    });
    roleField.querySelector("input, select, textarea")?.replaceWith?.(roleSelect);

    const contactField = createField({ label: "Contact info", type: "text", name: "contact", placeholder: "Phone or email" });

    const registerActions = document.createElement("div");
    registerActions.className = "form-actions";

    const registerButton = document.createElement("button");
    registerButton.type = "submit";
    registerButton.className = "button primary";
    registerButton.textContent = "Sign up";

    const switchToLogin = document.createElement("button");
    switchToLogin.type = "button";
    switchToLogin.className = "button outline";
    switchToLogin.textContent = "Back to sign in";

    registerActions.append(registerButton, switchToLogin);
    registerForm.append(registerTitle, nameField, regEmailField, regPasswordField, roleField, contactField, registerActions);

    switchToRegister.addEventListener("click", () => {
      loginForm.hidden = true;
      registerForm.hidden = false;
    });

    switchToLogin.addEventListener("click", () => {
      loginForm.hidden = false;
      registerForm.hidden = true;
    });

    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(loginForm);
      handleSignIn(data.get("email"), data.get("password"));
    });

    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(registerForm);
      handleRegister({
        name: (data.get("name") || "").trim(),
        email: (data.get("email") || "").trim().toLowerCase(),
        password: data.get("password") || "",
        role: data.get("role") || "coach",
        contact: (data.get("contact") || "").trim(),
      });
    });

    wrapper.append(loginForm, registerForm);
    container.appendChild(wrapper);
    return;
  }

  const summary = document.createElement("div");
  summary.className = "profile-summary";

  const heading = document.createElement("h2");
  heading.textContent = `Welcome back, ${user.name || user.email}`;

  const rolePill = document.createElement("span");
  rolePill.className = "role-pill";
  rolePill.textContent = user.role;

  const emailLine = document.createElement("p");
  emailLine.textContent = user.email;

  const signOutButton = document.createElement("button");
  signOutButton.type = "button";
  signOutButton.className = "button outline";
  signOutButton.textContent = "Sign out";
  signOutButton.addEventListener("click", () => {
    state.currentUserId = null;
    render();
  });

  summary.append(heading, rolePill, emailLine, signOutButton);
  container.appendChild(summary);
}

function renderProfileCard() {
  const card = elements.profileCard;
  if (!card) return;
  card.innerHTML = "";
  const user = getCurrentUser();

  const header = document.createElement("header");
  header.className = "card-header";
  const title = document.createElement("h2");
  title.textContent = "Profile";
  header.appendChild(title);

  card.appendChild(header);

  if (!user) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Sign in to update your profile details.";
    card.appendChild(message);
    return;
  }

  const form = document.createElement("form");
  form.className = "profile-form";

  const nameField = createField({ label: "Full name", type: "text", name: "name" });
  nameField.querySelector("input").value = user.name || "";

  const contactField = createField({ label: "Contact info", type: "text", name: "contact", placeholder: "Phone or email" });
  contactField.querySelector("input").value = user.contact || "";

  const roleInfo = document.createElement("p");
  roleInfo.textContent = `Role: ${capitalize(user.role)}`;

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "button primary";
  saveButton.textContent = "Save profile";

  form.append(nameField, contactField, roleInfo, saveButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    updateProfile({
      name: (data.get("name") || "").trim(),
      contact: (data.get("contact") || "").trim(),
    });
  });

  card.appendChild(form);
}

function renderNotifications() {
  const card = elements.notificationCard;
  if (!card) return;
  card.innerHTML = "";
  const user = getCurrentUser();

  const header = document.createElement("header");
  header.className = "card-header";
  const title = document.createElement("h2");
  title.textContent = "Notifications";
  header.appendChild(title);

  if (user) {
    const markButton = document.createElement("button");
    markButton.type = "button";
    markButton.className = "button text";
    markButton.textContent = "Mark all read";
    markButton.addEventListener("click", () => {
      markAllNotificationsRead(user.id);
    });
    header.appendChild(markButton);
  }

  card.appendChild(header);

  if (!user) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Sign in to see coach responses and invite updates.";
    card.appendChild(message);
    return;
  }

  const items = getNotificationsForUser(user.id);
  if (!items.length) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "You’re all caught up.";
    card.appendChild(message);
    return;
  }

  const list = document.createElement("div");
  list.className = "notification-list";

  items.forEach((notification) => {
    const item = document.createElement("article");
    item.className = `notification${notification.read ? "" : " unread"}`;

    const text = document.createElement("p");
    text.textContent = notification.message;

    const time = document.createElement("time");
    time.dateTime = notification.createdAt;
    time.textContent = formatRelative(notification.createdAt);

    item.append(text, time);
    list.appendChild(item);
  });

  card.appendChild(list);
}

function renderSessions() {
  const container = elements.sessionSummary;
  if (!container) return;
  container.innerHTML = "";

  const header = document.createElement("header");
  header.className = "card-header";
  const title = document.createElement("h2");
  title.textContent = "Training sessions";
  header.appendChild(title);

  container.appendChild(header);

  if (!state.sessions.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No sessions scheduled yet.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "session-list";

  const sortedSessions = state.sessions.slice().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const user = getCurrentUser();
  const coaches = getCoaches();

  sortedSessions.forEach((session) => {
    const card = document.createElement("article");
    card.className = "session-card";
    if (state.selectedSessionId === session.id) {
      card.classList.add("active");
    }
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, textarea, form")) return;
      setSelectedSession(session.id);
    });

    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.textContent = session.title;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = formatDateRange(session.start, session.end);

    header.append(title, badge);
    card.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "session-meta";
    if (session.location) {
      const location = document.createElement("p");
      location.textContent = `Location: ${session.location}`;
      meta.appendChild(location);
    }
    if (session.notes) {
      const notes = document.createElement("p");
      notes.textContent = session.notes;
      meta.appendChild(notes);
    }
    card.appendChild(meta);

    const rsvpData = state.rsvps[session.id] || {};
    const groups = groupResponses(coaches, rsvpData);

    const attendance = document.createElement("div");
    attendance.className = "session-attendance";

    const attendanceTitle = document.createElement("h4");
    attendanceTitle.textContent = "Coach responses";
    attendance.appendChild(attendanceTitle);

    const attendanceBar = document.createElement("div");
    attendanceBar.className = "attendance-bar";
    [
      ["yes", "Going"],
      ["maybe", "Maybe"],
      ["no", "Not going"],
      ["pending", "Awaiting"]
    ].forEach(([status, label]) => {
      const span = document.createElement("span");
      span.dataset.status = status;
      span.textContent = `${label}: ${groups[status].length}`;
      attendanceBar.appendChild(span);
    });
    attendance.appendChild(attendanceBar);

    const groupList = document.createElement("div");
    groupList.className = "session-groups";

    [
      ["yes", "In"],
      ["maybe", "Maybe"],
      ["pending", "Awaiting"],
      ["no", "Out"],
    ].forEach(([status, label]) => {
      const block = document.createElement("div");
      const heading = document.createElement("p");
      heading.innerHTML = `<strong>${label}</strong>: ${groups[status].map((coach) => coach.name).join(", ") || "—"}`;
      block.appendChild(heading);
      groupList.appendChild(block);
    });

    attendance.appendChild(groupList);
    card.appendChild(attendance);

    if (user && user.role === "coach") {
      const rsvpSection = createRsvpSection(session, user, rsvpData[user.id]);
      card.appendChild(rsvpSection);
    }

    if (user && user.role === "manager") {
      const actions = document.createElement("div");
      actions.className = "session-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "button outline";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        populateManageForm(session.id);
      });

      const resendButton = document.createElement("button");
      resendButton.type = "button";
      resendButton.className = "button outline";
      resendButton.textContent = "Resend invites";
      resendButton.addEventListener("click", () => resendInvites(session.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button outline";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => {
        if (window.confirm("Delete this session?")) {
          deleteSession(session.id);
        }
      });

      actions.append(editButton, resendButton, deleteButton);
      card.appendChild(actions);

      const inviteInfo = document.createElement("p");
      inviteInfo.className = "manage-help";
      if (session.lastInviteAt) {
        inviteInfo.textContent = `Last invite sent ${formatRelative(session.lastInviteAt)}.`;
      } else {
        inviteInfo.textContent = "Invites not sent yet.";
      }
      card.appendChild(inviteInfo);
    }

    list.appendChild(card);
  });

  container.appendChild(list);
}

function renderManageCard() {
  const card = elements.manageCard;
  if (!card) return;
  card.innerHTML = "";
  const user = getCurrentUser();

  const header = document.createElement("header");
  header.className = "card-header";
  const title = document.createElement("h2");
  title.textContent = "Manage sessions";
  header.appendChild(title);
  card.appendChild(header);

  if (!user) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Managers can create sessions once signed in.";
    card.appendChild(message);
    return;
  }

  if (user.role !== "manager") {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "You have coach access. Session edits are limited to managers.";
    card.appendChild(message);
    return;
  }

  const form = document.createElement("form");
  form.className = "form";
  form.id = "manageForm";

  const formGrid = document.createElement("div");
  formGrid.className = "form-grid";

  const titleField = createField({ label: "Title", type: "text", name: "title", required: true, placeholder: "Training focus" });
  const dateField = createField({ label: "Date", type: "date", name: "date", required: true });
  const startField = createField({ label: "Start time", type: "time", name: "start", required: true });
  const endField = createField({ label: "End time", type: "time", name: "end", required: true });
  const locationField = createField({ label: "Location", type: "text", name: "location", placeholder: "Pitch / facility" });
  const notesField = createField({ label: "Notes", name: "notes" });
  const textarea = document.createElement("textarea");
  textarea.name = "notes";
  textarea.rows = 3;
  notesField.querySelector("input, textarea")?.replaceWith?.(textarea);

  formGrid.append(titleField, dateField, startField, endField, locationField, notesField);

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button primary";
  submitButton.textContent = "Save session";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button outline";
  cancelButton.textContent = "Cancel edit";
  cancelButton.hidden = true;
  cancelButton.addEventListener("click", () => {
    form.reset();
    form.dataset.sessionId = "";
    cancelButton.hidden = true;
  });

  const errorText = document.createElement("p");
  errorText.className = "form-error";
  errorText.hidden = true;

  actions.append(submitButton, cancelButton, errorText);
  form.append(formGrid, actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorText.hidden = true;
    const data = new FormData(form);
    const payload = {
      title: (data.get("title") || "").trim(),
      date: data.get("date"),
      startTime: data.get("start"),
      endTime: data.get("end"),
      location: (data.get("location") || "").trim(),
      notes: (data.get("notes") || "").trim(),
    };
    const errors = validateSessionPayload(payload);
    if (errors.length) {
      errorText.textContent = errors.join(". ");
      errorText.hidden = false;
      return;
    }
    const sessionId = form.dataset.sessionId;
    if (sessionId) {
      updateSession(sessionId, payload, user);
    } else {
      createSession(payload, user);
    }
    form.reset();
    form.dataset.sessionId = "";
    cancelButton.hidden = true;
  });

  card.appendChild(form);

  if (state.sessions.length) {
    const note = document.createElement("p");
    note.className = "manage-help";
    note.textContent = "Edit sessions from the list to update or resend invitations.";
    card.appendChild(note);
  }
}

function populateManageForm(sessionId) {
  const form = document.getElementById("manageForm");
  if (!form) return;
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  form.dataset.sessionId = sessionId;
  form.querySelector('[name="title"]').value = session.title;
  form.querySelector('[name="date"]').value = formatDateInput(session.start);
  form.querySelector('[name="start"]').value = formatTimeInput(session.start);
  form.querySelector('[name="end"]').value = formatTimeInput(session.end);
  form.querySelector('[name="location"]').value = session.location || "";
  form.querySelector('[name="notes"]').value = session.notes || "";
  const cancelButton = form.querySelector('.button.outline');
  if (cancelButton) {
    cancelButton.hidden = false;
  }
}

function createRsvpSection(session, user, rsvp) {
  const section = document.createElement("section");
  section.className = "session-rsvp";

  const title = document.createElement("h4");
  title.textContent = "Your response";
  section.appendChild(title);

  const form = document.createElement("form");
  form.className = "form";

  const actions = document.createElement("div");
  actions.className = "rsvp-actions";

  const statusInput = document.createElement("input");
  statusInput.type = "hidden";
  statusInput.name = "status";
  statusInput.value = rsvp?.status || "";

  [
    ["yes", "Going", "primary"],
    ["maybe", "Maybe", "outline"],
    ["no", "Can't make it", "outline"],
  ].forEach(([value, label, appearance]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.status = value;
    button.className = `button ${appearance}`;
    button.textContent = label;
    if (rsvp?.status === value) {
      button.setAttribute("aria-pressed", "true");
    }
    button.addEventListener("click", () => {
      statusInput.value = value;
      actions.querySelectorAll("button").forEach((btn) => btn.removeAttribute("aria-pressed"));
      button.setAttribute("aria-pressed", "true");
    });
    actions.appendChild(button);
  });

  const commentField = document.createElement("div");
  commentField.className = "comment-field";
  const commentLabel = document.createElement("span");
  commentLabel.textContent = "Comments";
  const commentInput = document.createElement("textarea");
  commentInput.name = "comment";
  commentInput.placeholder = "Optional availability notes";
  commentInput.value = rsvp?.comment || "";
  commentField.append(commentLabel, commentInput);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button primary";
  submitButton.textContent = "Update response";

  form.append(statusInput, actions, commentField, submitButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = statusInput.value;
    if (!status) {
      window.alert("Select a response before submitting.");
      return;
    }
    submitRsvp(session.id, user, {
      status,
      comment: commentInput.value.trim(),
    });
  });

  section.appendChild(form);
  return section;
}

function handleSignIn(email, password) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const user = state.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail && candidate.password === password);
  if (!user) {
    window.alert("Incorrect email or password.");
    return;
  }
  state.currentUserId = user.id;
  render();
}

function handleRegister({ name, email, password, role, contact }) {
  if (!name || !email || !password) {
    window.alert("Complete all required fields.");
    return;
  }
  const exists = state.users.some((user) => user.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    window.alert("An account already exists for that email.");
    return;
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : `user-${Date.now()}`;
  const newUser = { id, name, email, password, role, contact };
  state.users.push(newUser);
  state.currentUserId = id;

  if (role === "coach") {
    addCoachToSessions(newUser);
    notifyManagers(`${newUser.name} joined as a coach. They have pending invites for upcoming sessions.`);
  }

  if (role === "manager") {
    addNotification(id, "You're set up as a manager. Create training sessions to invite the coaching team.");
  }

  render();
}

function updateProfile({ name, contact }) {
  const user = getCurrentUser();
  if (!user) return;
  user.name = name;
  user.contact = contact;
  addNotification(user.id, "Profile updated successfully.");
  render();
}

function createSession(payload, creator, options = {}) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
  const start = combineDateTime(payload.date, payload.startTime);
  const end = combineDateTime(payload.date, payload.endTime);
  const session = {
    id,
    title: payload.title || "Training Session",
    location: payload.location || "",
    notes: payload.notes || "",
    start,
    end,
    createdBy: creator?.id || null,
    updatedAt: nowIso(),
    lastInviteAt: null,
    inviteHistory: [],
    invitedCoachIds: getCoaches().map((coach) => coach.id),
  };

  state.sessions.push(session);
  state.rsvps[id] = {};
  getCoaches().forEach((coach) => {
    state.rsvps[id][coach.id] = { status: "pending", comment: "", updatedAt: nowIso() };
  });
  sendInvites(session, creator, options.silent ? "Initial schedule" : "New session scheduled");
  state.selectedSessionId = id;
  if (!options.silent) {
    addNotification(creator.id, `${session.title} scheduled for ${formatDateRange(session.start, session.end)}.`);
  }
  render();
}

function updateSession(sessionId, payload, user) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.title = payload.title || session.title;
  session.location = payload.location || "";
  session.notes = payload.notes || "";
  session.start = combineDateTime(payload.date, payload.startTime);
  session.end = combineDateTime(payload.date, payload.endTime);
  session.updatedAt = nowIso();
  sendInvites(session, user, "Session updated");
  addNotification(user.id, `${session.title} updated. Coaches have been notified.`);
  render();
}

function deleteSession(sessionId) {
  const index = state.sessions.findIndex((item) => item.id === sessionId);
  if (index === -1) return;
  const session = state.sessions[index];
  state.sessions.splice(index, 1);
  delete state.rsvps[sessionId];
  notifyAll(`${session.title} was cancelled.`);
  if (state.selectedSessionId === sessionId) {
    state.selectedSessionId = state.sessions[0]?.id || null;
  }
  render();
}

function resendInvites(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  const user = getCurrentUser();
  if (!session || !user) return;
  sendInvites(session, user, "Invite reminder");
  addNotification(user.id, `Invites resent for ${session.title}.`);
  render();
}

function sendInvites(session, sender, reason) {
  session.lastInviteAt = nowIso();
  session.inviteHistory.push({
    sentAt: session.lastInviteAt,
    reason,
    sentBy: sender?.id || null,
  });
  getCoaches().forEach((coach) => {
    addNotification(
      coach.id,
      `${reason}: ${session.title} on ${formatDateRange(session.start, session.end)}. Please review your availability.`,
      { sessionId: session.id }
    );
    if (!state.rsvps[session.id]) {
      state.rsvps[session.id] = {};
    }
    if (!state.rsvps[session.id][coach.id]) {
      state.rsvps[session.id][coach.id] = { status: "pending", comment: "", updatedAt: nowIso() };
    }
  });
}

function submitRsvp(sessionId, user, payload) {
  if (!state.rsvps[sessionId]) {
    state.rsvps[sessionId] = {};
  }
  state.rsvps[sessionId][user.id] = {
    status: payload.status,
    comment: payload.comment,
    updatedAt: nowIso(),
  };
  const session = state.sessions.find((item) => item.id === sessionId);
  if (session) {
    notifyManagers(`${user.name || user.email} responded ${payload.status.toUpperCase()} for ${session.title}.`);
  }
  addNotification(user.id, `Response saved for ${session?.title || "session"}.`);
  render();
}

function addCoachToSessions(coach) {
  state.sessions.forEach((session) => {
    if (!session.invitedCoachIds.includes(coach.id)) {
      session.invitedCoachIds.push(coach.id);
    }
    if (!state.rsvps[session.id]) {
      state.rsvps[session.id] = {};
    }
    state.rsvps[session.id][coach.id] = { status: "pending", comment: "", updatedAt: nowIso() };
    addNotification(coach.id, `New invitation: ${session.title} on ${formatDateRange(session.start, session.end)}.`);
  });
}

function addNotification(userId, message) {
  state.notifications.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random()}`,
    userId,
    message,
    read: false,
    createdAt: nowIso(),
  });
}

function markAllNotificationsRead(userId) {
  state.notifications.forEach((item) => {
    if (item.userId === userId) {
      item.read = true;
    }
  });
  render();
}

function notifyManagers(message) {
  getManagers().forEach((manager) => addNotification(manager.id, message));
}

function notifyAll(message) {
  state.users.forEach((user) => addNotification(user.id, message));
}

function getNotificationsForUser(userId) {
  return state.notifications
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);
}

function getCurrentUser() {
  if (!state.currentUserId) return null;
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function getManagers() {
  return state.users.filter((user) => user.role === "manager");
}

function getCoaches() {
  return state.users.filter((user) => user.role === "coach");
}

function setSelectedSession(sessionId) {
  state.selectedSessionId = sessionId;
  render();
}

function groupResponses(coaches, rsvpMap) {
  const groups = { yes: [], maybe: [], no: [], pending: [] };
  coaches.forEach((coach) => {
    const entry = rsvpMap[coach.id];
    const status = entry?.status || "pending";
    if (!groups[status]) {
      groups[status] = [];
    }
    groups[status].push(coach);
  });
  return groups;
}

function validateSessionPayload(payload) {
  const errors = [];
  if (!payload.title) errors.push("Title is required");
  if (!payload.date) errors.push("Choose a date");
  if (!payload.startTime) errors.push("Start time required");
  if (!payload.endTime) errors.push("End time required");
  if (payload.startTime && payload.endTime) {
    const start = combineDateTime(payload.date, payload.startTime);
    const end = combineDateTime(payload.date, payload.endTime);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      errors.push("End time must be after the start time");
    }
  }
  return errors;
}

function createField({ label, type = "text", name, required = false, placeholder = "" }) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.required = required;
  if (placeholder) {
    input.placeholder = placeholder;
  }
  wrapper.append(span, input);
  return wrapper;
}

function formatDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const datePart = new Intl.DateTimeFormat("en-GB", ISO_DATE_OPTIONS).format(startDate);
  const startTime = new Intl.DateTimeFormat("en-GB", ISO_TIME_OPTIONS).format(startDate);
  const endTime = new Intl.DateTimeFormat("en-GB", ISO_TIME_OPTIONS).format(endDate);
  return `${datePart}, ${startTime} – ${endTime}`;
}

function formatDateInput(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimeInput(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMinutes(date, amount) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + amount);
  return result;
}

function combineDateTime(date, time) {
  return `${date}T${time}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatRelative(value) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
