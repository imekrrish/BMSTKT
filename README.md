# Premiere Watch

Premiere Watch is a production-ready, single-service ticket availability monitor for the public BookMyShow page for **Allu Cinemas, Kokapet** on **29 July 2026**. It checks every 60 seconds, displays live status in a responsive dashboard, and sends one email per unique set of bookable showtimes.

It monitors public information only. It never signs in, bypasses access protection, reserves seats, or purchases tickets.

## Architecture

One persistent Node.js 22 process runs:

- an Express API and production React static server;
- a Playwright Chromium browser manager;
- a non-overlapping `setTimeout` monitoring worker;
- an atomic JSON state store;
- SMTP email delivery, with Resend as an optional fallback.

The detector combines visible showtime text, actionable controls, enabled/disabled state, booking URLs, target cinema context, and target date context. An alert requires at least two independent availability signals plus the target context. `BLOCKED`, `PAGE_CHANGED`, and `ERROR` states can never trigger a ticket alert.

State is stored at `$DATA_PATH/premiere-watch-state.json`. Writes use a temporary file and atomic rename. The store retains the last 100 checks, notification history, and up to 1,000 notified fingerprints.

## Local setup

Prerequisites: Node.js 22.

```bash
npm install
npx playwright install chromium
copy .env.example .env
npm run dev
```

The dashboard is at `http://localhost:5173`; Vite proxies API requests to port 3000. The monitor starts automatically. For a production-style local run:

```bash
npm run build
npm start
```

Run one browser check without starting the dashboard:

```bash
npm run check:once
```

On local machines where `/data` is unavailable, the app automatically uses `./data`.

## Email setup

SMTP is the default. Configure:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
EMAIL_FROM=Premiere Watch <alerts@example.com>
EMAIL_TO=you@example.com
```

For implicit TLS, providers commonly use port 465 with `SMTP_SECURE=true`. If `SMTP_HOST` is empty and `RESEND_API_KEY` is set, Resend is used instead. `EMAIL_FROM` must be a sender accepted by your provider.

Set `DRY_RUN=true` to perform checks and log alerts without sending email. The dashboard test-email control respects dry-run mode.

## Environment variables

Copy `.env.example`. Important values:

| Variable | Purpose | Default |
|---|---|---|
| `TARGET_URL` | Exact public page to monitor | Allu Cinemas dated URL |
| `TARGET_CINEMA` | Human-readable target cinema | `Allu Cinemas Kokapet` |
| `TARGET_DATE` | ISO target date | `2026-07-29` |
| `CHECK_INTERVAL_SECONDS` | Normal interval; minimum 30 | `60` |
| `TIMEZONE` | Browser and display timezone | `Asia/Kolkata` |
| `DATA_PATH` | Persistent state directory | `/data` |
| `DASHBOARD_PASSWORD` | Enables dashboard/API login when set | empty |
| `SESSION_SECRET` | HMAC secret for auth cookies | password fallback |
| `ADMIN_WARNING_EMAIL_ENABLED` | Send one warning for a block reason | `true` |
| `DRY_RUN` | Suppress actual email delivery | `false` |

Secrets are only read by the server and are never returned to React. Only a masked recipient is exposed.

## Railway deployment

1. Push this repository to GitHub and create a Railway service from it.
2. Railway detects `railway.json` and builds the multi-stage `Dockerfile`.
3. Add the variables from `.env.example` in the Railway service. Set real email credentials.
4. Add a Railway volume and mount it at `/data`.
5. Keep one replica running continuously. Do **not** enable scale-to-zero.
6. Deploy and confirm `/api/health` returns HTTP 200.

The runtime image is the official Playwright image and includes Chromium and its system libraries. No Railway Cron is used: the persistent process owns the one-minute scheduler. The health check has a 120-second deployment timeout.

## Scripts and testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests use sanitized fixtures for unavailable, available, disabled, multiple-showtime, unexpected-layout, and blocked pages. They cover fingerprints, notification transitions, and the rule that non-availability statuses cannot alert.

Build the container locally when Docker is available:

```bash
docker build -t premiere-watch .
docker run --rm -p 3000:3000 --env-file .env -v premiere-watch-data:/data premiere-watch
```

## Reliability

- A mutex skips concurrent scheduled/manual checks.
- Browser crashes cause automatic Chromium recreation.
- Navigation is retried once.
- Each check is capped at 55 seconds.
- Technical failures use exponential backoff capped at five minutes.
- Any successful page result restores the configured interval.
- `SIGTERM`/`SIGINT` stop scheduling, wait briefly for an active check, close Chromium, and exit.
- State survives restarts when `/data` is mounted.

A valid “tickets not open” page is a successful check and does not increase failure counts.

## Duplicate prevention

Enabled showtimes are normalized, sorted, and hashed with SHA-256. After a successful email (or dry-run alert), its fingerprint is persisted. The same availability state cannot send again after a check or restart. A newly enabled or newly added showtime changes the fingerprint and can send a fresh alert. Disabled showtimes do not affect the availability fingerprint.

## Updating detection when BookMyShow changes

Selectors and text patterns are centralized in [`src/monitor/selectors.ts`](src/monitor/selectors.ts). Update that file first, then add a sanitized HTML fixture that captures the new structure and extend the unit tests. Extraction is implemented in [`src/monitor/extractShowtimes.ts`](src/monitor/extractShowtimes.ts), while the multi-signal decision policy is in [`src/monitor/detectAvailability.ts`](src/monitor/detectAvailability.ts).

If the cinema context or recognizable layout disappears, the detector returns `PAGE_CHANGED` instead of guessing that booking is open.

## Troubleshooting

### Chromium does not launch

Run `npx playwright install chromium` locally. On Linux outside Docker, `npx playwright install --with-deps chromium` installs required system packages. Railway uses the official Playwright image, so do not replace its runtime base without installing the equivalent dependencies.

### The page is blocked

The dashboard reports `BLOCKED` with the detected reason and the worker retries on its normal schedule. The app deliberately does not evade CAPTCHA, Cloudflare, rate limits, authentication, or access controls. Repeated normal access may remain blocked; in that case pause monitoring or use BookMyShow’s official notifications. One administrative email is sent per unique block reason when enabled.

### Email is not delivered

Use “Send test email” on the dashboard. Check Railway structured logs, SMTP host/port/TLS settings, sender verification, and provider restrictions. With `DRY_RUN=true`, delivery is intentionally suppressed.

### Health endpoint reports 503

Ten consecutive technical failures mark the service unhealthy. Inspect logs and the dashboard error, confirm Chromium can start, and confirm the target URL is reachable. A successful check restores health.

## Responsible use

Use a respectful interval and monitor only publicly accessible pages you are permitted to access. The default is one request per minute. Do not modify this project to circumvent controls or automate purchasing. Ticket availability can change between detection and opening the booking page.
