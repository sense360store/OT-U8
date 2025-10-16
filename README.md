# Ossett U8s Training RSVP

A minimal static site scaffold that can be deployed to GitHub Pages. The layout
includes a responsive header, an empty main section ready for future features,
and a simple footer. All assets are plain HTML, CSS, and JavaScript so the site
can be hosted without a build step.

## Project structure

```
.
├── index.html             # Static entry point with header, main, footer
├── assets/
│   └── styles.css         # Base styling and responsive layout helpers
├── src/
│   └── app.js             # Lightweight script that hydrates footer details
└── .github/workflows/
    └── pages.yml          # GitHub Actions workflow for Pages deployments
```

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
