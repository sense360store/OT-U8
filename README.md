# Coach RSVP Tracker

A lightweight static web application that helps youth coaches respond to upcoming training sessions. Coaches can authenticate with Firebase, view a shared calendar, and log their RSVP in real time. The site is designed to deploy directly to GitHub Pages with Firebase providing authentication and data storage.

## Features

- 🔐 Firebase Authentication with Google and Email/Password providers.
- 📅 FullCalendar month and list views with local timezone display.
- ✅ Real-time Firestore updates for events and RSVPs.
- 🧑‍🤝‍🧑 Live attendee panel grouped by status (Yes / Maybe / No).
- 🔔 Toast feedback for authentication and RSVP actions.
- 🛡️ Firestore rules restrict event management to admins and protect RSVP data.
- 🌗 Responsive, accessible layout with automatic light/dark mode.

## Getting started

1. **Clone and install dependencies**
   ```bash
   git clone <your-fork-url>
   cd OT-U8
   ```
   The app is framework-free, so there are no runtime dependencies to install.

2. **Create and configure Firebase**
   - In the Firebase console create a new **project** and register a **Web App** to reveal the config snippet.
   - Under **Build → Authentication**, enable the **Google** sign-in provider (Email/Password is optional but supported).
   - Under **Build → Firestore**, create a **Cloud Firestore** database in production mode for the project's default location.

3. **Configure Firebase in the app**
   - Open `index.html` and replace the `window.__FIREBASE_CONFIG` placeholder with the config from your Firebase web app.
   - If you plan to use the seeding helper page, repeat the change in `scripts/seed.html`.

4. **Publish Firestore security rules**
   - Install the Firebase CLI if needed: `npm install -g firebase-tools`.
   - Authenticate and target your project: `firebase login` then `firebase use <your-project-id>`.
   - Deploy the bundled rules file:
     ```bash
     firebase deploy --only firestore:rules --project <your-project-id> --source rules/firestore.rules
     ```

5. **Create the first admin record**
   - After signing in once, find your user in **Authentication → Users** and copy the UID.
   - In Firestore add a document at `roles/{uid}` with contents `{ "role": "admin" }` so you can manage events.

6. **Enable GitHub Pages deployment**
   - Push your changes to the `main` branch of your fork.
   - In **Repository Settings → Pages**, choose **GitHub Actions** as the source.
   - The included workflow (`.github/workflows/pages.yml`) uploads the static site and publishes it to Pages on every push to `main`.

## Development workflow

Because the project is a static site you can use any static server for local testing, for example:

```bash
npx serve .
```

The app loads Firebase and FullCalendar from public CDNs so an internet connection is required during development.

## Deployment

This repository includes a GitHub Actions workflow that publishes to GitHub Pages on every push to the `main` branch (`.github/workflows/pages.yml`). Enable Pages in your repository settings and select the “GitHub Actions” source.

## Usage

1. Open `https://<your-username>.github.io/<repo>` after the Pages workflow runs.
2. Sign in with Google or Email/Password.
3. Select a calendar event to view details and respond with **Yes**, **Maybe**, or **No**.
4. Your RSVP appears instantly in the attendee list for all coaches.
5. Admins can visit `/scripts/seed.html` after signing in to add example events for onboarding.

## Firestore data model

- `events/{eventId}`: `{ title, start, end, location?, notes?, createdBy }`
- `rsvps/{eventId}_{uid}`: `{ rsvpId, eventId, uid, coachName, status, updatedAt }`
- `roles/{uid}`: `{ role }` where role is `admin` or `coach`

Timestamps are stored in UTC (Firestore default). The UI converts them to each coach’s local timezone.

## Future enhancements (not yet implemented)

- Coach roster management and invitations.
- Team-specific calendars and filtering.
- CSV export of attendance reports.
- Automated reminders before each session.
- Admin workflow for approving new role requests.
