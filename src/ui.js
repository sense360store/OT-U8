const detailsContainer = document.getElementById("details");
const authContainer = document.getElementById("auth-area");
const toastEl = document.getElementById("toast");

let uiHandlers = {};

function initUI(handlers = {}) {
  uiHandlers = handlers;
}

function renderAuth({ user, isAdmin, hasAccess, accessReady }) {
  if (!authContainer) return;
  authContainer.innerHTML = "";

  if (!user) {
    const googleButton = document.createElement("button");
    googleButton.className = "button";
    googleButton.type = "button";
    googleButton.textContent = "Sign in with Google";
    googleButton.addEventListener("click", () => uiHandlers.onGoogleSignIn?.());

    const form = document.createElement("form");
    form.setAttribute("aria-label", "Email sign in");

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.required = true;
    emailInput.placeholder = "coach@example.com";
    emailInput.name = "email";
    emailInput.autocomplete = "email";

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.required = true;
    passwordInput.placeholder = "Password";
    passwordInput.name = "password";
    passwordInput.autocomplete = "current-password";

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "button";
    submitButton.textContent = "Sign In";

    const registerButton = document.createElement("button");
    registerButton.type = "button";
    registerButton.className = "button button-secondary";
    registerButton.textContent = "Register";

    const forgotButton = document.createElement("button");
    forgotButton.type = "button";
    forgotButton.className = "button button-secondary";
    forgotButton.textContent = "Forgot?";

    form.append(emailInput, passwordInput, submitButton, registerButton, forgotButton);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      uiHandlers.onEmailSignIn?.(email, password);
    });

    registerButton.addEventListener("click", () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const suggestedName = email ? email.split("@")[0] : "";
      uiHandlers.onRegister?.(email, password, suggestedName);
    });

    forgotButton.addEventListener("click", () => {
      const email = emailInput.value.trim();
      uiHandlers.onResetPassword?.(email);
    });

    const note = document.createElement("p");
    note.className = "auth-note";
    note.textContent = "Coaches must sign in to respond to training invitations.";

    authContainer.append(googleButton, form, note);
  } else {
    const userInfo = document.createElement("div");
    userInfo.className = "attendee-name";

    const initials = (user.displayName || user.email || "").slice(0, 2).toUpperCase();
    const avatar = document.createElement("span");
    avatar.className = "initials";
    avatar.textContent = initials;

    const label = document.createElement("span");
    label.textContent = user.displayName || user.email;

    userInfo.append(avatar, label);

    if (isAdmin) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Admin";
      userInfo.append(badge);
    }

    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.className = "button button-secondary";
    signOutButton.textContent = "Sign Out";
    signOutButton.addEventListener("click", () => uiHandlers.onSignOut?.());

    authContainer.append(userInfo, signOutButton);

    if (!accessReady) {
      const accessNote = document.createElement("p");
      accessNote.className = "auth-note";
      accessNote.textContent = "Checking your access…";
      authContainer.appendChild(accessNote);
    } else if (hasAccess === false) {
      const warning = document.createElement("p");
      warning.className = "auth-note auth-note-warning";
      warning.textContent = "Access required. Contact an administrator for approval.";
      authContainer.appendChild(warning);
    }
  }
}

function renderEventDetails({
  event,
  rsvps = [],
  user,
  isAdmin,
  isLoadingRsvps,
  hasAccess,
  accessReady,
}) {
  if (!detailsContainer) return;
  detailsContainer.innerHTML = "";

  if (user && !accessReady) {
    const heading = document.createElement("h2");
    heading.textContent = "Checking access";

    const note = document.createElement("p");
    note.className = "placeholder";
    note.textContent = "Hang tight while we confirm your permissions.";

    detailsContainer.append(heading, note);
    return;
  }

  if (user && accessReady && hasAccess === false) {
    const heading = document.createElement("h2");
    heading.textContent = "Access required";

    const message = document.createElement("p");
    message.className = "placeholder";
    message.textContent = "Only approved coaches can view event schedules and RSVPs. Contact an administrator to request access.";

    detailsContainer.append(heading, message);
    return;
  }

  if (!event) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "Select an event to review responses and share your plans.";
    detailsContainer.append(placeholder);
    return;
  }

  const title = document.createElement("h2");
  title.textContent = event.title;

  const metaList = document.createElement("ul");
  const dateItem = document.createElement("li");
  dateItem.textContent = formatDateRange(event.start, event.end);

  metaList.appendChild(dateItem);

  if (event.location) {
    const locationItem = document.createElement("li");
    locationItem.textContent = `Location: ${event.location}`;
    metaList.appendChild(locationItem);
  }

  if (event.notes) {
    const notesItem = document.createElement("li");
    notesItem.textContent = event.notes;
    metaList.appendChild(notesItem);
  }

  detailsContainer.append(title, metaList);

  if (isLoadingRsvps) {
    const loader = document.createElement("div");
    loader.className = "spinner";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", "Loading responses");
    detailsContainer.append(loader);
  }

  if (!user) {
    const alert = document.createElement("div");
    alert.className = "alert alert-info";
    alert.textContent = "Sign in to RSVP and view attendee responses.";
    detailsContainer.append(alert);
    return;
  }

  const status = window.App.rsvp.getUserStatus(rsvps, user.uid, event.id);

  const form = document.createElement("form");
  form.className = "rsvp-form";
  form.setAttribute("aria-label", "RSVP form");
  form.dataset.eventId = event.id;

  const legend = document.createElement("h3");
  legend.textContent = "Your RSVP";
  form.appendChild(legend);

  const optionsGroup = document.createElement("div");
  optionsGroup.className = "rsvp-options";

  window.App.rsvp.RSVP_STATUSES.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "rsvp";
    input.value = option.value;
    input.required = true;
    input.checked = option.value === status;
    label.append(input, document.createTextNode(`${option.icon} ${option.label}`));
    optionsGroup.appendChild(label);
  });

  form.appendChild(optionsGroup);

  const selectStatus = (value) => {
    if (!value) return;
    const target = form.querySelector(`input[name='rsvp'][value='${value}']`);
    if (target) {
      target.checked = true;
    }
  };

  if (status) {
    selectStatus(status);
  }

  if (user?.uid) {
    window.App.rsvp
      .loadUserStatus(event.id, user.uid)
      .then((resolvedStatus) => {
        if (!resolvedStatus) return;
        if (form.dataset.eventId !== event.id) return;
        selectStatus(resolvedStatus);
      })
      .catch(() => {});
  }

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button";
  submit.textContent = "Save";
  form.appendChild(submit);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = form.querySelector("input[name='rsvp']:checked");
    if (!selected) return;
    uiHandlers.onRsvpSubmit?.(selected.value);
  });

  detailsContainer.appendChild(form);

  const grouped = window.App.rsvp.groupByStatus(rsvps);
  Object.entries(grouped).forEach(([statusKey, attendees]) => {
    const statusMeta = window.App.rsvp.RSVP_STATUSES.find((item) => item.value === statusKey);
    const wrapper = document.createElement("section");
    wrapper.className = "status-group";

    const heading = document.createElement("h3");
    const count = attendees.length;

    const headingLabel = document.createElement("span");
    headingLabel.textContent = `${statusMeta?.icon || ""} ${statusMeta?.label || statusKey}`.trim();

    const headingCount = document.createElement("span");
    headingCount.textContent = count.toString();
    headingCount.className = "status-count";

    heading.append(headingLabel, headingCount);
    wrapper.appendChild(heading);

    if (!attendees.length) {
      const empty = document.createElement("p");
      empty.className = "placeholder";
      empty.textContent = "No responses yet.";
      wrapper.appendChild(empty);
    } else {
      const list = document.createElement("ul");
      const sortedAttendees = attendees
        .slice()
        .sort((a, b) => {
          const nameA = (a.coachName || a.uid || "").toLowerCase();
          const nameB = (b.coachName || b.uid || "").toLowerCase();
          if (nameA === nameB) {
            return (a.uid || "").localeCompare(b.uid || "");
          }
          return nameA.localeCompare(nameB);
        });

      sortedAttendees.forEach((attendee) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "attendee-name";

        const initials = document.createElement("span");
        initials.className = "initials";
        initials.textContent = (attendee.coachName || attendee.uid || "").slice(0, 2).toUpperCase();

        const label = document.createElement("span");
        label.textContent = attendee.coachName || attendee.uid;

        name.append(initials, label);
        item.appendChild(name);
        list.appendChild(item);
      });
      wrapper.appendChild(list);
    }

    detailsContainer.appendChild(wrapper);
  });

  if (isAdmin) {
    const adminNote = document.createElement("p");
    adminNote.className = "auth-note";
    adminNote.textContent = "Admins can manage events via Firestore or the optional seed page.";
    detailsContainer.appendChild(adminNote);
  }
}

function showToast(message, { tone = "default", duration = 4000 } = {}) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.dataset.tone = tone;
  setTimeout(() => {
    toastEl.hidden = true;
  }, duration);
}

window.App = window.App || {};
window.App.ui = {
  initUI,
  renderAuth,
  renderEventDetails,
  showToast,
};

export { initUI, renderAuth, renderEventDetails, showToast };

function formatDateRange(start, end) {
  if (!start) return "";
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });
  const startLabel = formatter.format(startDate);
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
