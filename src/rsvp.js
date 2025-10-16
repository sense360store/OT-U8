const RSVP_STATUSES = [
  { value: "yes", label: "Yes", icon: "✅" },
  { value: "maybe", label: "Maybe", icon: "❔" },
  { value: "no", label: "No", icon: "❌" },
];

function groupByStatus(rsvps = []) {
  return RSVP_STATUSES.reduce((acc, status) => {
    acc[status.value] = rsvps.filter((item) => item.status === status.value);
    return acc;
  }, {});
}

function getUserStatus(rsvps = [], uid) {
  if (!uid) return null;
  const match = rsvps.find((rsvp) => rsvp.uid === uid);
  return match ? match.status : null;
}

window.App = window.App || {};
window.App.rsvp = {
  RSVP_STATUSES,
  groupByStatus,
  getUserStatus,
};

export { RSVP_STATUSES, groupByStatus, getUserStatus };
