const DEFAULT_API_BASE = 'http://localhost:8000';
const HTTPS_PAGE = window.location.protocol === 'https:';

function normalizeApiBase(candidate) {
  const trimmed = candidate?.trim();
  if (!trimmed) {
    throw new Error('value is empty');
  }

  let url;
  try {
    url = new URL(trimmed, window.location.href);
  } catch (error) {
    throw new Error('value is not a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('URL must use http or https');
  }

  if (HTTPS_PAGE && url.protocol !== 'https:') {
    throw new Error('HTTPS page requires an https:// API URL');
  }

  let path = url.pathname;
  if (path === '/') {
    path = '';
  } else if (path.endsWith('/')) {
    path = path.replace(/\/+$/, '');
  }

  return `${url.origin}${path}`;
}

function deriveApiBase() {
  const sources = [
    { value: document.querySelector('meta[name="otj-api-base"]')?.getAttribute('content') || '', label: 'meta tag' },
    { value: window.localStorage.getItem('otj_api_base') || '', label: 'saved preference' },
    { value: DEFAULT_API_BASE, label: 'default' },
  ];

  for (const source of sources) {
    if (!source.value || !source.value.trim()) {
      continue;
    }
    try {
      const normalized = normalizeApiBase(source.value);
      console.info(`Using API base from ${source.label}: ${normalized}`);
      return normalized;
    } catch (error) {
      const message = `Skipping API base from ${source.label}: ${error.message}`;
      if (source.label === 'meta tag') {
        console.error(message);
      } else {
        console.warn(message);
      }
    }
  }

  const warning = HTTPS_PAGE
    ? 'No HTTPS API base configured. Use the API settings button to provide a secure endpoint.'
    : 'No API base configured. Use the API settings button to set one.';
  console.error(warning);
  throw new Error(warning);
}

const API_BASE = deriveApiBase();
console.info('Change the API URL via the API settings button in the header. Clear the value to reset to defaults.');
const state = {
  token: sessionStorage.getItem('otj_token') || null,
  memberships: {},
  teams: [],
  currentTeam: null,
  sessions: [],
  members: [],
  invites: [],
  selectedSession: null,
  profile: null,
};

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app');
const authForm = document.getElementById('auth-form');
const authHelp = document.getElementById('auth-help');
const logoutBtn = document.getElementById('logout');
const apiSettingsBtn = document.getElementById('api-settings');
const teamSelect = document.getElementById('team-select');
const teamRoleChip = document.getElementById('team-role');
const sessionList = document.getElementById('session-list');
const sessionEmpty = document.getElementById('session-empty');
const sessionDetail = document.getElementById('detail-content');
const lockSessionBtn = document.getElementById('lock-session');
const newSessionBtn = document.getElementById('new-session');
const membersList = document.getElementById('members-list');
const membersEmpty = document.getElementById('members-empty');
const inviteButton = document.getElementById('invite-member');
const inviteDrawer = document.getElementById('invite-form');
const inviteForm = document.getElementById('invite-create');
const inviteStatus = document.getElementById('invite-status');
const inviteList = document.getElementById('invite-list');
const toast = document.getElementById('toast');
const exportCsv = document.getElementById('export-csv');
const printRoster = document.getElementById('print-roster');
const cancelInvite = document.getElementById('cancel-invite');

if (apiSettingsBtn) {
  apiSettingsBtn.addEventListener('click', () => {
    const stored = window.localStorage.getItem('otj_api_base') || '';
    const current = stored || API_BASE;
    const next = window.prompt(
      'Set the API base URL for this browser. Provide an https:// endpoint when served over HTTPS. Leave blank to clear the saved override.',
      current,
    );

    if (next === null) {
      return;
    }

    if (!next.trim()) {
      window.localStorage.removeItem('otj_api_base');
      window.alert('Saved API base cleared. Reloading…');
      window.location.reload();
      return;
    }

    try {
      const normalized = normalizeApiBase(next);
      window.localStorage.setItem('otj_api_base', normalized);
      window.alert('API base saved. Reloading…');
      window.location.reload();
    } catch (error) {
      window.alert(`Invalid API base: ${error.message}`);
    }
  });
}

async function apiFetch(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (response.status === 401) {
    showToast('Session expired. Please sign in again.');
    signOut();
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    let detail = 'Request failed';
    try {
      const body = await response.json();
      detail = body.error || detail;
    } catch (e) {
      detail = response.statusText;
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function signOut() {
  sessionStorage.removeItem('otj_token');
  state.token = null;
  state.teams = [];
  state.memberships = {};
  state.currentTeam = null;
  state.sessions = [];
  state.members = [];
  state.invites = [];
  state.profile = null;
  appSection.hidden = true;
  authSection.hidden = false;
  logoutBtn.hidden = true;
  authForm.reset();
  authForm.querySelector('input')?.focus();
}

function renderTeams() {
  teamSelect.innerHTML = '';
  state.teams.forEach((team) => {
    const option = document.createElement('option');
    option.value = String(team.team_id);
    option.textContent = `${team.name}`;
    teamSelect.appendChild(option);
  });
  if (state.currentTeam) {
    teamSelect.value = String(state.currentTeam);
  } else if (state.teams.length) {
    state.currentTeam = state.teams[0].team_id;
    teamSelect.value = String(state.currentTeam);
  }
  updateRoleChip();
}

function updateRoleChip() {
  if (!state.currentTeam) {
    teamRoleChip.textContent = '';
    return;
  }
  const role = state.memberships[state.currentTeam];
  teamRoleChip.textContent = role ? role.toUpperCase() : '';
  const isManager = role === 'manager';
  newSessionBtn.hidden = !isManager;
  inviteButton.hidden = !isManager;
  lockSessionBtn.hidden = true;
  inviteDrawer.hidden = true;
}

function renderSessions() {
  sessionList.innerHTML = '';
  if (!state.sessions.length) {
    sessionEmpty.hidden = false;
    return;
  }
  sessionEmpty.hidden = true;
  state.sessions.forEach((session) => {
    const li = document.createElement('li');
    li.className = 'session-card';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.dataset.id = session.id;
    li.setAttribute('aria-selected', state.selectedSession && state.selectedSession.id === session.id ? 'true' : 'false');
    const title = document.createElement('h3');
    title.textContent = session.title;
    const meta = document.createElement('div');
    meta.className = 'session-meta';
    const start = new Date(session.start_at);
    const end = new Date(session.end_at);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
    });
    const startText = document.createElement('span');
    startText.textContent = formatter.format(start);
    const status = document.createElement('span');
    status.className = 'badge';
    status.textContent = session.is_effectively_locked ? 'Locked' : 'Open';
    meta.append(startText, status);
    li.append(title, meta);
    li.addEventListener('click', () => selectSession(session.id));
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectSession(session.id);
      }
    });
    sessionList.appendChild(li);
  });
}

function renderMembers() {
  membersList.innerHTML = '';
  if (!state.members.length) {
    membersEmpty.hidden = false;
    return;
  }
  membersEmpty.hidden = true;
  const isManager = state.memberships[state.currentTeam] === 'manager';
  state.members.forEach((member) => {
    const li = document.createElement('li');
    li.className = 'member-item';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(member.display_name || member.email)}</strong><br /><span>${escapeHtml(member.email)}</span>`;
    li.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'member-actions';
    if (isManager) {
      const select = document.createElement('select');
      ['player', 'coach', 'manager'].forEach((role) => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role;
        if (member.role === role) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', async () => {
        try {
          await apiFetch(`/teams/${state.currentTeam}/members/${member.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ role: select.value }),
          });
          showToast('Role updated');
          await loadMembers();
        } catch (error) {
          showToast(error.message);
        }
      });
      actions.append(select);
      const remove = document.createElement('button');
      remove.className = 'ghost';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        if (!confirm(`Remove ${member.display_name || member.email}?`)) return;
        try {
          await apiFetch(`/teams/${state.currentTeam}/members/${member.id}`, { method: 'DELETE' });
          showToast('Member removed');
          await loadMembers();
        } catch (error) {
          showToast(error.message);
        }
      });
      actions.append(remove);
    } else {
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = member.role;
      actions.append(span);
    }
    li.appendChild(actions);
    membersList.appendChild(li);
  });
}

function renderInvites() {
  inviteList.innerHTML = '';
  if (!state.invites.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No pending invites.';
    inviteList.appendChild(empty);
    return;
  }
  state.invites.forEach((invite) => {
    const li = document.createElement('li');
    li.className = 'invite-item';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(invite.email)}</strong><br /><span>${escapeHtml(invite.role)}</span>`;
    const revoke = document.createElement('button');
    revoke.className = 'ghost';
    revoke.textContent = 'Revoke';
    revoke.addEventListener('click', async () => {
      try {
        await apiFetch(`/teams/${state.currentTeam}/invites/${invite.id}`, { method: 'DELETE' });
        showToast('Invite revoked');
        await loadInvites();
      } catch (error) {
        showToast(error.message);
      }
    });
    li.append(info, revoke);
    inviteList.appendChild(li);
  });
}

function renderSessionDetail() {
  sessionDetail.innerHTML = '';
  lockSessionBtn.hidden = true;
  if (!state.selectedSession) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Select a session to view details.';
    sessionDetail.appendChild(p);
    return;
  }
  const session = state.selectedSession;
  const dl = document.createElement('dl');
  const infoItems = [
    ['Starts', formatDate(session.start_at)],
    ['Ends', formatDate(session.end_at)],
    ['Location', session.location || 'TBC'],
    ['Notes', session.description || 'No description'],
    ['Status', session.is_effectively_locked ? 'Locked' : 'Open'],
  ];
  infoItems.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  });
  sessionDetail.appendChild(dl);

  const role = state.memberships[state.currentTeam];
  if (role === 'manager') {
    lockSessionBtn.hidden = false;
    lockSessionBtn.textContent = session.is_effectively_locked ? 'Unlock session' : 'Lock session';
    lockSessionBtn.onclick = async () => {
      try {
        await apiFetch(`/teams/${state.currentTeam}/sessions/${session.id}`, {
          method: 'PUT',
          body: JSON.stringify({ is_locked: !session.is_effectively_locked }),
        });
        showToast('Session updated');
        await loadSessions();
        selectSession(session.id);
      } catch (error) {
        showToast(error.message);
      }
    };
    const danger = document.createElement('button');
    danger.className = 'ghost';
    danger.textContent = 'Delete session';
    danger.addEventListener('click', async () => {
      if (!confirm('Delete this session?')) return;
      try {
        await apiFetch(`/teams/${state.currentTeam}/sessions/${session.id}`, { method: 'DELETE' });
        showToast('Session deleted');
        await loadSessions();
        state.selectedSession = null;
        renderSessions();
        renderSessionDetail();
      } catch (error) {
        showToast(error.message);
      }
    });
    sessionDetail.appendChild(danger);
  }

  const rsvpHeading = document.createElement('h3');
  rsvpHeading.textContent = 'Your RSVP';
  sessionDetail.appendChild(rsvpHeading);
  const rsvpForm = document.createElement('form');
  rsvpForm.className = 'rsvp-form';
  const select = document.createElement('select');
  ['yes', 'no', 'maybe', 'pending'].forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    select.appendChild(option);
  });
  const note = document.createElement('textarea');
  note.rows = 3;
  note.placeholder = 'Add an optional note';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = 'Save RSVP';
  const feedback = document.createElement('p');
  feedback.className = 'form-help';
  rsvpForm.append(select, note, submit, feedback);

  rsvpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await apiFetch(`/teams/${state.currentTeam}/sessions/${session.id}/rsvps/self`, {
        method: 'PUT',
        body: JSON.stringify({ status: select.value, note: note.value }),
      });
      feedback.textContent = 'Saved!';
      showToast('RSVP saved');
    } catch (error) {
      feedback.textContent = error.message;
    }
  });

  sessionDetail.appendChild(rsvpForm);
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/London',
    }).format(date);
  } catch (error) {
    return dateString;
  }
}

function escapeHtml(value) {
  const span = document.createElement('span');
  span.textContent = value ?? '';
  return span.innerHTML;
}

async function selectSession(sessionId) {
  state.selectedSession = state.sessions.find((session) => session.id === sessionId) || null;
  renderSessions();
  renderSessionDetail();
  if (state.selectedSession) {
    sessionDetail.scrollIntoView({ behavior: 'smooth' });
  }
}

async function loadSessions() {
  if (!state.currentTeam) return;
  try {
    const data = await apiFetch(`/teams/${state.currentTeam}/sessions`);
    state.sessions = data.sessions || [];
    if (state.selectedSession) {
      const updated = state.sessions.find((session) => session.id === state.selectedSession.id);
      state.selectedSession = updated || null;
    }
    renderSessions();
  } catch (error) {
    sessionEmpty.hidden = false;
    sessionEmpty.textContent = error.message;
  }
}

async function loadMembers() {
  if (!state.currentTeam) return;
  try {
    const data = await apiFetch(`/teams/${state.currentTeam}/members`);
    state.members = data.members || [];
    renderMembers();
  } catch (error) {
    membersEmpty.hidden = false;
    membersEmpty.textContent = error.message;
  }
}

async function loadInvites() {
  if (!state.currentTeam) return;
  if (state.memberships[state.currentTeam] !== 'manager') {
    state.invites = [];
    renderInvites();
    return;
  }
  try {
    const data = await apiFetch(`/teams/${state.currentTeam}/invites`);
    state.invites = data.invites || [];
    renderInvites();
  } catch (error) {
    inviteStatus.textContent = error.message;
  }
}

async function refreshTeamData() {
  await Promise.all([loadSessions(), loadMembers(), loadInvites()]);
  renderSessionDetail();
}

async function handleLogin(event) {
  event.preventDefault();
  authHelp.textContent = 'Signing in…';
  const payload = {
    email: document.getElementById('auth-email').value,
    invite_code: document.getElementById('auth-code').value,
    season_code: document.getElementById('auth-season').value || undefined,
    profile: {
      display_name: document.getElementById('profile-name').value,
      guardian_name: document.getElementById('profile-guardian').value,
      phone: document.getElementById('profile-phone').value,
    },
  };
  try {
    const data = await apiFetch('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.token = data.token;
    state.memberships = data.memberships;
    state.teams = data.teams;
    state.profile = data.profile;
    sessionStorage.setItem('otj_token', state.token);
    authSection.hidden = true;
    appSection.hidden = false;
    logoutBtn.hidden = false;
    renderTeams();
    await refreshTeamData();
    showToast('Welcome back!');
    document.getElementById('main').focus();
  } catch (error) {
    authHelp.textContent = error.message;
  }
}

async function createSessionForm() {
  const form = document.createElement('form');
  form.className = 'session-editor';
  const title = createInput('Title', 'text', 'session-title', true);
  const start = createInput('Start time (ISO)', 'datetime-local', 'session-start', true);
  const end = createInput('End time (ISO)', 'datetime-local', 'session-end', true);
  const location = createInput('Location', 'text', 'session-location');
  const description = document.createElement('textarea');
  description.placeholder = 'Description';
  description.rows = 3;
  const autoLock = createInput('Auto lock (minutes)', 'number', 'session-lock');
  const lockLabel = document.createElement('label');
  const lock = document.createElement('input');
  lock.type = 'checkbox';
  lock.id = 'session-locked';
  lockLabel.textContent = 'Lock immediately';
  lockLabel.prepend(lock);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = 'Create session';
  const feedback = document.createElement('p');
  feedback.className = 'form-help';
  form.append(title.wrapper, start.wrapper, end.wrapper, location.wrapper, description, autoLock.wrapper, lockLabel, submit, feedback);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await apiFetch(`/teams/${state.currentTeam}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.input.value,
          start_at: new Date(start.input.value).toISOString(),
          end_at: new Date(end.input.value).toISOString(),
          location: location.input.value,
          description: description.value,
          auto_lock_minutes: autoLock.input.value ? Number(autoLock.input.value) : null,
          is_locked: lock.checked,
        }),
      });
      feedback.textContent = 'Created!';
      await loadSessions();
      newSessionBtn.disabled = false;
      form.remove();
      showToast('Session created');
    } catch (error) {
      feedback.textContent = error.message;
    }
  });
  return form;
}

function createInput(labelText, type, id, required = false) {
  const wrapper = document.createElement('label');
  wrapper.htmlFor = id;
  wrapper.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  if (required) input.required = true;
  wrapper.appendChild(input);
  return { wrapper, input };
}

teamSelect.addEventListener('change', async () => {
  state.currentTeam = Number(teamSelect.value);
  updateRoleChip();
  await refreshTeamData();
});

inviteButton.addEventListener('click', async () => {
  inviteDrawer.hidden = !inviteDrawer.hidden;
  if (!inviteDrawer.hidden) {
    await loadInvites();
    document.getElementById('invite-email').focus();
  }
});

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  inviteStatus.textContent = 'Sending…';
  try {
    await apiFetch(`/teams/${state.currentTeam}/invites`, {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('invite-email').value,
        role: document.getElementById('invite-role').value,
      }),
    });
    inviteStatus.textContent = 'Invite sent!';
    inviteForm.reset();
    await loadInvites();
  } catch (error) {
    inviteStatus.textContent = error.message;
  }
});

cancelInvite.addEventListener('click', () => {
  inviteDrawer.hidden = true;
});

logoutBtn.addEventListener('click', () => {
  signOut();
});

authForm.addEventListener('submit', handleLogin);

newSessionBtn.addEventListener('click', async () => {
  if (!state.currentTeam) return;
  if (state.memberships[state.currentTeam] !== 'manager') return;
  newSessionBtn.disabled = true;
  const form = await createSessionForm();
  sessionDetail.innerHTML = '';
  sessionDetail.appendChild(form);
});

exportCsv.addEventListener('click', async () => {
  if (!state.currentTeam) return;
  if (!state.selectedSession) {
    showToast('Select a session first');
    return;
  }
  try {
    const data = await apiFetch(`/teams/${state.currentTeam}/sessions/${state.selectedSession.id}/rsvps`);
    const rows = [['Name', 'Email', 'Status', 'Note']];
    data.rsvps.forEach((entry) => {
      rows.push([
        entry.display_name || entry.email,
        entry.email,
        entry.status,
        (entry.note || '').replace(/\n/g, ' '),
      ]);
    });
    const csv = rows.map((row) => row.map((value) => `"${(value || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `session-${state.selectedSession.id}-rsvps.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message);
  }
});

printRoster.addEventListener('click', () => {
  const rosterWindow = window.open('', 'printRoster');
  if (!rosterWindow) {
    showToast('Enable pop-ups to print');
    return;
  }
  rosterWindow.document.write('<html><head><title>Roster</title></head><body>');
  rosterWindow.document.write(`<h1>${document.title}</h1>`);
  rosterWindow.document.write('<ul>');
  state.members.forEach((member) => {
    rosterWindow.document.write(`<li>${escapeHtml(member.display_name || member.email)} - ${escapeHtml(member.role)}</li>`);
  });
  rosterWindow.document.write('</ul>');
  rosterWindow.document.write('</body></html>');
  rosterWindow.document.close();
  rosterWindow.focus();
  rosterWindow.print();
});

if (state.token) {
  (async () => {
    try {
      const data = await apiFetch('/teams');
      state.memberships = {};
      data.teams.forEach((team) => {
        state.memberships[team.team_id] = team.role;
      });
      state.teams = data.teams;
      state.profile = { id: data.profile_id, email: data.email, display_name: data.display_name };
      authSection.hidden = true;
      appSection.hidden = false;
      logoutBtn.hidden = false;
      renderTeams();
      await refreshTeamData();
    } catch (error) {
      signOut();
    }
  })();
}
