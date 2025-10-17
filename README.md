# OTJ U8s Training Platform

A lightweight invite-only training coordination platform for the OTJ U8s programme. The stack is intentionally dependency-light so it can run anywhere Python 3 is available.

## Repository layout

```
backend/
  app/
    auth.py          # Invite onboarding, token issuance, RBAC helpers
    config.py        # Environment configuration
    db.py            # SQLite connection, migrations
    http.py          # Minimal routing and request helpers
    routes/          # Session, RSVP, invite, and roster endpoints
    services/        # Activity logging and notification hooks
    utils/           # Time helpers
  migrations/        # SQL migration files
  seed.py            # Seed Titans/Trojans/Gladiators/Spartans/Argonauts teams
frontend/
  index.html         # Mobile-first single page application
  styles.css         # OTJ U8s branding and responsive layout
  app.js             # Authentication, RBAC-aware UI, CSV export, print view
Makefile             # One-command setup, run, and seed helpers
```

## Quick start

1. Ensure Python 3.10+ is installed.
2. Configure required environment variables (see below).
3. Run the setup command:

   ```bash
   make setup
   ```

   This creates `.venv/` and primes Python tooling.

4. Apply migrations and start the API (in separate terminals if needed):

   ```bash
   make run-backend
   ```

   The server listens on `http://localhost:8000`.

5. Serve the static frontend (e.g. with Python):

   ```bash
   cd frontend
   python3 -m http.server 4173
   ```

   Open `http://localhost:4173` in a browser. The UI reads the API base URL from the `<meta name="otj-api-base">` tag, a saved preference (set via the **API settings** button in the header), or falls back to `http://localhost:8000`.

6. (Optional) Seed baseline data:

   ```bash
   TITANS_MANAGER_EMAIL=coach.titans@example.com \
   TROJANS_MANAGER_EMAIL=coach.trojans@example.com \
   GLADIATORS_MANAGER_EMAIL=coach.gladiators@example.com \
   SPARTANS_MANAGER_EMAIL=coach.spartans@example.com \
   ARGONAUTS_MANAGER_EMAIL=coach.argonauts@example.com \
   make seed
   ```

## Configuring the frontend API base

The single-page frontend needs to know where to find the backend API. It checks the following in order and uses the first valid HTTPS (when hosted over HTTPS) value:

1. The `<meta name="otj-api-base">` tag in `frontend/index.html`.
2. A browser-specific override saved to `localStorage` (set via the **API settings** button in the header).
3. The development default `http://localhost:8000`.

Clearing the prompt when using the **API settings** button removes the override and reverts to the tag/default. Values saved in the browser are per-device and per-origin.

### Deploying to GitHub Pages

GitHub Pages always serves over HTTPS, so configure the frontend with an HTTPS API endpoint:

1. Update the `<meta name="otj-api-base">` tag in `frontend/index.html` with your production API URL (for example, `https://api.example.com`).
2. Publish the `frontend/` directory (or a copy of it) to the branch/folder GitHub Pages uses—commonly by copying its contents into `docs/` and enabling Pages from the repository settings.
3. Once published, verify the deployed site loads without API errors. If the production API URL changes, update the meta tag and redeploy. End users can still adjust the value per-browser with the **API settings** button if the tag is blank.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_PATH` | SQLite file path | `./otj_u8.db` |
| `APP_SECRET` | HMAC signing secret for tokens | `dev-secret` (override in production) |
| `APP_BASE_URL` | Public URL used in invite links | `http://localhost:8000` |
| `INVITE_TTL_HOURS` | Invite validity duration | `120` |
| `SESSION_LOCK_GRACE_MINUTES` | Buffer before start time to auto-lock | `5` |
| `SEASON_ACCESS_CODE` | Optional extra guard required during onboarding | unset |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server for notifications | unset |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | SMTP credentials | unset |
| `EMAIL_SENDER` | From address for notification emails | unset |
| `ENABLE_EMAIL` | Set to `true` to send notifications when SMTP is configured | `false` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowlist of origins permitted to call the API | `*` |
| `CORS_ALLOWED_METHODS` | Methods echoed in `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `CORS_ALLOWED_HEADERS` | Headers echoed in `Access-Control-Allow-Headers` | `Authorization, Content-Type` |
| `CORS_ALLOW_CREDENTIALS` | Set to `true` to send `Access-Control-Allow-Credentials: true` | `false` |
| `TITANS_MANAGER_EMAIL` … `ARGONAUTS_MANAGER_EMAIL` | Seed script manager assignments | unset |

For example, when deploying behind GitHub Pages you might set `CORS_ALLOWED_ORIGINS=https://your-org.github.io` so browsers can
call the API, and enable `CORS_ALLOW_CREDENTIALS=true` if session cookies need to flow across origins.

## Features

* Invite-based onboarding with optional season access code.
* Access token issuance and per-team RBAC (manager, coach, player).
* Session CRUD with auto-lock rules, cascade deletes, and activity logging.
* RSVP endpoints restricted to self-updates (managers may manage the roster).
* Notification service only dispatches emails when SMTP vars are present.
* Mobile-first frontend with:
  * Authenticated routing and team switcher.
  * Calendar-style session cards and detailed RSVP view.
  * Manager tooling for invites, roster, and session administration.
  * CSV export, printable roster, and empty/error states.
  * Europe/London time defaults and accessible keyboard/focus flows.

## Testing and linting

The project uses the Python standard library exclusively, so no additional dependencies are required. Automated tests are not yet included; run-time validation is driven by API responses. Feel free to add `pytest` or similar within the virtual environment created by `make setup`.

## Security and safety notes

* All API responses include sanitized payloads and enforce membership checks server-side.
* Inputs parsed from the frontend are trimmed and validated before touching the database.
* Authentication tokens are HMAC-signed and tracked for revocation.
* The frontend keeps state in-memory/sessionStorage and only renders data after successful authentication.
