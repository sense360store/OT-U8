# Ossett U8s Training RSVP

A Material Design 3 inspired training planner for Ossett Town Juniors U8s. The
site runs entirely on GitHub Pages with Firebase Authentication and Firestore
providing secure coach-only access, live calendars, RSVPs, and session
management.

## Features

- 🔐 Access gate + Google sign-in for approved coaches and admins.
- 📆 FullCalendar month and list views with real-time Firestore updates.
- ✅ RSVP tracking with grouped attendee lists (Yes / Maybe / No).
- 📝 Manage panel for creating, editing, or deleting training sessions.
- 🎨 Light/dark mode, accent colour picker, and Material 3 styling.
- 🚦 Toast notifications for key actions and status changes.
- 📱 Mobile-first bottom sheet details view, list-calendar toggle, and safe-area aware layout.

## 1. Firebase setup

1. **Create a Firebase project**
   - In the Firebase console, create a project and add a **Web app**. Copy the
     configuration snippet (apiKey, authDomain, etc.).
   - Enable **Google** as a provider under **Build → Authentication**.
   - Create a **Cloud Firestore** database in production mode under
     **Build → Firestore**.

2. **Publish the supplied security rules**
   ```bash
   npm install -g firebase-tools     # if you don't already have it
   firebase login
   firebase use <your-project-id>
   firebase deploy --only firestore:rules --project <your-project-id> --source rules/firestore.rules
   ```

3. **Seed the first admin / coach records**
   - Sign in once so your account appears under **Authentication → Users**.
   - In Firestore create `roles/{uid}` with `{ "role": "admin" }` for your UID
     so you can approve other coaches.
   - Allowlist additional coaches by adding documents at
     `allowlist/{coach-email}` with any placeholder data (e.g. `{ allowed: true }`).
   - Coaches without allowlist/role access can submit an access request via the
     interface (stored at `access_requests/{uid}`).

## 2. Configure the app

1. **Firebase config**
   - Open `index.html` and replace the placeholder in
     `window.__FIREBASE_CONFIG` with the Web app config copied earlier.
   - The same object is read at runtime by `src/bootstrap.js`.

2. **Access gate code**
   - The Google button is hidden until a simple access code is entered. The
     current hash lives in `src/bootstrap.js` (`gateHash`).
   - To change it, generate a SHA-256 hash for your new code:
     ```bash
     node -e "console.log(require('crypto').createHash('sha256').update('my-new-code').digest('hex'))"
     ```
   - Replace the hash string and redeploy. Share the plain-text code only with
     trusted coaches.

## 3. Run locally

The project is 100% static—no build step required. Use any static file server
so the relative paths and ES modules load correctly:

```bash
npx serve .
```

Then open http://localhost:3000/ (default `serve` port). Update
`window.__FIREBASE_CONFIG` with your project values so Firebase can initialise
while running locally.

## 4. GitHub Pages deployment

1. Commit all changes and push to the repository configured for GitHub Pages.
2. In **Settings → Pages**, pick **GitHub Actions** as the source if prompted.
3. Because the site lives in a repository sub-path (`/OT-U8/`), the
   `<base href="/OT-U8/">` tag in `index.html` ensures all assets resolve
   correctly on GitHub Pages and the `404.html` redirect fixes deep-link refresh
   behaviour.

## 5. Daily operations

### Calendar & RSVPs
- Approved coaches see the calendar immediately after sign-in.
- Selecting a session reveals full details and an RSVP control.
- Responses are written to `rsvps/{eventId}_{uid}` and grouped live on screen.

### Manage sessions
- Click **Manage** to open the admin/coach panel.
- Fill in the form to create or edit a session. Times are converted to UTC
  timestamps before being saved.
- Only admins can edit/delete any session; coaches can manage the sessions they
  created. Firestore rules enforce this server-side.
- Drag-select dates on the calendar for a quick-add prompt. Sessions default to
  a 1-hour slot but can be adjusted later.

### Handling access requests
- Non-allowlisted coaches can submit a request from the app. Review and approve
  them by copying the UID from `access_requests/{uid}` into `roles/{uid}` or
  adding their email to `allowlist/{email}`.

### Mobile experience
- On screens under 900px the calendar defaults to `listMonth` and automatically
  toggles views when rotating or resizing.
- Tapping an event opens a modal bottom sheet (80svh max height) that disables
  background scroll, includes a drag handle, and respects device safe areas.
- Session management cards collapse into stacked mobile cards with large touch
  targets (44px+) and typography sized to avoid iOS zoom.
- Header/footer padding and the bottom sheet all honour `env(safe-area-*)`
  insets to keep content clear of notches and home indicators.

With the configuration steps above a new maintainer can deploy, secure, and run
training RSVPs in minutes.
