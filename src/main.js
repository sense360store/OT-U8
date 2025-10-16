import "./access.js";
import "./firebase.js";
import "./auth.js";
import "./dataModel.js";
import "./rsvp.js";
import { initUI, renderAuth, showToast } from "./ui.js";
import { initManage, renderManage } from "./manage.js";

const state = {
  user: null,
  isAdmin: false,
  events: [],
  filter: "all",
};

function init() {
  initUI({
    onGoogleSignIn: () => window.App.auth.signInWithGoogle(),
    onEmailSignIn: (email, password) => window.App.auth.signInWithEmail(email, password),
    onRegister: (email, password, suggestedName) =>
      window.App.auth.registerWithEmail(email, password, suggestedName),
    onResetPassword: (email) => window.App.auth.sendReset(email),
    onSignOut: () => window.App.auth.signOutUser(),
  });

  initManage({
    onFilterChange: handleFilterChange,
    onUpdate: handleEventUpdate,
    onDelete: handleEventDelete,
  });

  window.App.auth.listenToAuth(async (user) => {
    state.user = user;
    state.isAdmin = false;
    if (user?.uid) {
      state.isAdmin = await window.App.dataModel.checkIfAdmin(user.uid);
    }
    renderAuth({ user, isAdmin: state.isAdmin });
    renderManageView();
  });

  window.App.dataModel.listenToEvents((events) => {
    state.events = events;
    renderManageView();
  });

  renderManageView();
}

function handleFilterChange(filter) {
  state.filter = filter;
  renderManageView();
}

function handleEventUpdate(eventId, payload) {
  if (!state.isAdmin) {
    showToast("Only admins can update events", { tone: "error" });
    return Promise.reject(new Error("Not authorised"));
  }
  return window.App.dataModel
    .updateEvent(eventId, payload)
    .then(() => {
      showToast("Event updated", { tone: "success" });
    })
    .catch((error) => {
      console.error(error);
      showToast("Failed to update event", { tone: "error" });
      throw error;
    });
}

function handleEventDelete(eventId) {
  if (!state.isAdmin) {
    showToast("Only admins can delete events", { tone: "error" });
    return Promise.reject(new Error("Not authorised"));
  }
  return window.App.dataModel
    .deleteEvent(eventId)
    .then(() => {
      showToast("Event deleted", { tone: "success" });
    })
    .catch((error) => {
      console.error(error);
      showToast("Failed to delete event", { tone: "error" });
      throw error;
    });
}

function renderManageView() {
  const filteredEvents = state.filter === "mine" && state.user?.uid
    ? state.events.filter((event) => event.createdBy === state.user.uid)
    : state.events;

  renderManage({
    events: filteredEvents,
    filter: state.filter,
    isAdmin: state.isAdmin,
    user: state.user,
  });
}

init();
