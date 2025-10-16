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

2. **Create a Firebase project**
   - Enable **Authentication** with **Email/Password** and **Google** providers.
   - Create a **Cloud Firestore** database in production mode.
   - In the Firebase console, add a **Web App** and copy the config snippet.

3. **Configure Firebase in the app**
   - Open `index.html` and replace the `window.__FIREBASE_CONFIG` placeholder with your Firebase project's configuration.
   - Do the same in `scripts/seed.html` if you plan to use the seeding helper page.

4. **Deploy Firestore security rules**
   - Install the Firebase CLI if you have not already: `npm install -g firebase-tools`.
   - Login and set your project: `firebase login` then `firebase use <your-project-id>`.
   - Deploy the provided rules:
     ```bash
     firebase deploy --only firestore:rules --project <your-project-id> --source rules/firestore.rules
     ```

5. **Assign admin role (optional)**
   - In Firestore, create a document at `roles/{uid}` for the first admin with contents `{ "role": "admin" }`.
   - You can find your UID in the Authentication users table after signing in once.

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
