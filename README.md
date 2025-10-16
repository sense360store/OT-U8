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
