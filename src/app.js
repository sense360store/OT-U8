const state = {
  events: [],
  user: null,
  isAdmin: false,
  hasAccess: null,
  accessReady: false,
  accessInfo: null,
  selectedEventId: null,
  selectedEvent: null,
  rsvps: [],
  unsubscribeRsvps: null,
  unsubscribeEvents: null,
  unsubscribeAccess: null,
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

  window.App.calendar.initCalendar({ onSelect: handleEventSelected });

  window.App.auth.listenToAuth((user) => {
    const previousUser = state.user;
    const previousUid = previousUser?.uid;
    state.user = user;
    const userChanged = previousUid && previousUid !== user?.uid;

    if (!user) {
      clearAccessSubscription();
      clearRsvpSubscription();
      clearEventsSubscription();
      resetEventState();
      state.isAdmin = false;
      state.hasAccess = null;
      state.accessReady = false;
      state.accessInfo = null;
      window.App.ui.renderAuth({ user: null, isAdmin: false, hasAccess: null, accessReady: true });
      renderDetails();
      return;
    }

    if (!previousUid || userChanged) {
      clearRsvpSubscription();
      clearEventsSubscription();
      resetEventState();
    }

    clearAccessSubscription();
    state.isAdmin = false;
    state.hasAccess = null;
    state.accessReady = false;
    state.accessInfo = null;
    window.App.ui.renderAuth({ user, isAdmin: false, hasAccess: null, accessReady: false });

    state.unsubscribeAccess = window.App.access.subscribeToAccess(user, handleAccessUpdate);
  });
}

function handleAccessUpdate(access) {
  state.isAdmin = access.isAdmin;
  state.accessReady = access.isReady;
  state.accessInfo = access;
  const previousHasAccess = state.hasAccess;
  state.hasAccess = access.isReady ? access.hasAccess : null;

  if (access.isReady && previousHasAccess !== state.hasAccess) {
    applyAccessEffects(state.hasAccess);
  }

  window.App.ui.renderAuth({
    user: state.user,
    isAdmin: state.isAdmin,
    hasAccess: state.hasAccess,
    accessReady: state.accessReady,
  });
  renderDetails();
}

function applyAccessEffects(hasAccess) {
  if (!state.user) {
    clearEventsSubscription();
    clearRsvpSubscription();
    resetEventState();
    return;
  }

  if (!hasAccess) {
    clearEventsSubscription();
    clearRsvpSubscription();
    resetEventState();
    return;
  }

  subscribeToEvents();
  if (state.selectedEventId) {
    subscribeToRsvps(state.selectedEventId);
  }
}

function clearAccessSubscription() {
  if (typeof state.unsubscribeAccess === "function") {
    state.unsubscribeAccess();
  }
  state.unsubscribeAccess = null;
}

function resetEventState() {
  state.events = [];
  state.selectedEventId = null;
  state.selectedEvent = null;
  state.rsvps = [];
  state.isLoadingRsvps = false;
  window.App.calendar?.setEvents?.([]);
  window.App.calendar?.setActiveEvent?.(null);
}

function handleEventSelected(event) {
  if (!state.user) {
    window.App.ui.showToast("Sign in to view event details", { tone: "info" });
    return;
  }

  if (state.hasAccess !== true) {
    const tone = state.accessReady ? "error" : "info";
    const message = state.accessReady
      ? "Access required to view this event"
      : "Checking your access…";
    window.App.ui.showToast(message, { tone });
    return;
  }

  state.selectedEventId = event.id;
  state.selectedEvent = normalizeEvent(event);
  window.App.calendar.setActiveEvent(event.id);
  subscribeToRsvps(event.id);
  renderDetails();
}

function subscribeToRsvps(eventId) {
  if (!eventId || state.hasAccess !== true) {
    clearRsvpSubscription();
    state.rsvps = [];
    state.isLoadingRsvps = false;
    return;
  }
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

function subscribeToEvents() {
  if (state.hasAccess !== true) {
    return;
  }
  if (state.unsubscribeEvents) {
    return;
  }
  state.unsubscribeEvents = window.App.dataModel.listenToEvents((events) => {
    state.events = events.map(normalizeEvent).sort((a, b) => new Date(a.start) - new Date(b.start));
    window.App.calendar.setEvents(state.events);
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
  });
}

function clearEventsSubscription() {
  if (typeof state.unsubscribeEvents === "function") {
    state.unsubscribeEvents();
  }
  state.unsubscribeEvents = null;
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
  if (state.hasAccess !== true) {
    window.App.ui.showToast("Access required to RSVP", { tone: "error" });
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
    hasAccess: state.hasAccess,
    accessReady: state.accessReady,
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

bootstrap();
