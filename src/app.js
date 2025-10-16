const state = {
  events: [],
  user: null,
  isAdmin: false,
  selectedEventId: null,
  selectedEvent: null,
  rsvps: [],
  unsubscribeRsvps: null,
  isLoadingRsvps: false,
};

function bootstrap() {
  window.App.ui.initUI({
    onGoogleSignIn: handleGoogleSignIn,
    onEmailSignIn: handleEmailSignIn,
    onRegister: handleRegister,
    onResetPassword: handlePasswordReset,
    onSignOut: handleSignOut,
    onRsvpSubmit: handleRsvpSubmit,
  });

  window.App.calendar.initCalendar();
  window.App.calendar.onEventSelected(handleEventSelected);
  window.App.calendar.onEventsChanged(handleEventsUpdated);

  window.App.auth.listenToAuth(async (user) => {
    state.user = user;
    state.isAdmin = user ? await window.App.dataModel.checkIfAdmin(user.uid) : false;
    if (!user) {
      clearRsvpSubscription();
      state.events = [];
      state.selectedEventId = null;
      state.selectedEvent = null;
      window.App.calendar.setActiveEvent(null);
      state.rsvps = [];
      state.isLoadingRsvps = false;
    } else if (state.selectedEventId) {
      subscribeToRsvps(state.selectedEventId);
    }
    window.App.ui.renderAuth({ user, isAdmin: state.isAdmin });
    renderDetails();
  });
}

function handleEventSelected(event) {
  state.selectedEventId = event.id;
  state.selectedEvent = normalizeEvent(event);
  window.App.calendar.setActiveEvent(event.id);
  if (state.user) {
    subscribeToRsvps(event.id);
  } else {
    clearRsvpSubscription();
    state.rsvps = [];
    state.isLoadingRsvps = false;
  }
  renderDetails();
}

function subscribeToRsvps(eventId) {
  clearRsvpSubscription();
  state.isLoadingRsvps = true;
  state.rsvps = [];
  renderDetails();
  state.unsubscribeRsvps = window.App.dataModel.listenToRsvps(eventId, (rsvps) => {
    state.rsvps = rsvps;
    state.isLoadingRsvps = false;
    renderDetails();
  });
}

function clearRsvpSubscription() {
  if (typeof state.unsubscribeRsvps === "function") {
    state.unsubscribeRsvps();
  }
  state.unsubscribeRsvps = null;
  state.isLoadingRsvps = false;
}

function handleGoogleSignIn() {
  window.App.auth
    .signInWithGoogle()
    .then(() => window.App.ui.showToast("Welcome back!"))
    .catch(() => {});
}

function handleEmailSignIn(email, password) {
  if (!email || !password) {
    window.App.ui.showToast("Enter email and password", { tone: "error" });
    return;
  }
  window.App.auth
    .signInWithEmail(email, password)
    .then(() => window.App.ui.showToast("Signed in"))
    .catch(() => {});
}

function handleRegister(email, password, displayName) {
  if (!email || !password) {
    window.App.ui.showToast("Provide email and password", { tone: "error" });
    return;
  }
  window.App.auth
    .registerWithEmail(email, password, displayName)
    .then(() => window.App.ui.showToast("Account created"))
    .catch(() => {});
}

function handlePasswordReset(email) {
  window.App.auth
    .sendReset(email)
    .then(() => window.App.ui.showToast("Password reset email sent", { tone: "info" }))
    .catch(() => {});
}

function handleSignOut() {
  window.App.auth
    .signOutUser()
    .then(() => window.App.ui.showToast("Signed out", { tone: "info" }))
    .catch(() => {});
}

function handleRsvpSubmit(status) {
  if (!state.user) {
    window.App.ui.showToast("Sign in to RSVP", { tone: "error" });
    return;
  }
  if (!state.selectedEventId) {
    window.App.ui.showToast("Choose an event first", { tone: "error" });
    return;
  }
  window.App.dataModel
    .saveMyRsvp(state.selectedEventId, state.user, status)
    .then(() => window.App.ui.showToast("RSVP saved", { tone: "success" }))
    .catch(() => {});
}

function renderDetails() {
  window.App.ui.renderEventDetails({
    event: state.selectedEvent,
    rsvps: state.rsvps,
    user: state.user,
    isAdmin: state.isAdmin,
    isLoadingRsvps: state.isLoadingRsvps,
  });
}

function normalizeEvent(event) {
  const normalizeTime = (value) => {
    if (!value) return null;
    if (value.toDate) {
      return value.toDate().toISOString();
    }
    if (value.seconds) {
      return new Date(value.seconds * 1000).toISOString();
    }
    return new Date(value).toISOString();
  };

  return {
    ...event,
    start: normalizeTime(event.start),
    end: normalizeTime(event.end),
  };
}

function handleEventsUpdated(events) {
  state.events = events.map(normalizeEvent).sort((a, b) => new Date(a.start) - new Date(b.start));
  if (state.selectedEventId) {
    const exists = state.events.find((event) => event.id === state.selectedEventId);
    if (!exists) {
      state.selectedEventId = null;
      state.selectedEvent = null;
      clearRsvpSubscription();
      window.App.calendar.setActiveEvent(null);
    } else {
      state.selectedEvent = exists;
      window.App.calendar.setActiveEvent(state.selectedEventId);
    }
  }
  renderDetails();
}

bootstrap();
