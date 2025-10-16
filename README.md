# Ossett U8s Training RSVP

A minimal static site scaffold that can be deployed to GitHub Pages. The layout
includes a responsive header, an empty main section ready for future features,
and a simple footer. All assets are plain HTML, CSS, and JavaScript so the site
can be hosted without a build step.

## Project structure

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

## Local development

Because this is a static site, you can open `index.html` directly in the
browser. For a local server (recommended for testing relative paths), run:

```bash
npx serve .
```

## Deployment

Pushes to the `main` branch trigger the included GitHub Actions workflow. Make
sure GitHub Pages is enabled in your repository settings and set to the "GitHub
Actions" source. The workflow uploads the root of the repository as the site
artifact and publishes it automatically.

## Manage Sessions

Coaches and administrators who are allowlisted for Manage can update session
details directly from the interface. Access is limited to approved accounts, so
make sure your email is on the allowlist before attempting to sign in.

### Add, edit, or delete sessions

1. Open the Manage dashboard and navigate to the Sessions view.
2. Use the **Add Session** button to create a new entry, or select an existing
   session to modify its details.
3. Save your changes. Coaches will only see and edit the sessions they own,
   while administrators can update or delete any session in the list.
4. To remove a session, choose the delete option within the session controls and
   confirm when prompted.

Coaches are restricted to managing their own schedules. Administrators have full
permissions across all sessions, allowing them to add, adjust, or remove any
coach's session as needed.
