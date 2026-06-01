# EC2 Deployment Guide

Use this guide for first-time EC2/RDS host provisioning. Once the host, systemd unit, nginx, and environment file exist, use `docs/staging-runbook.md` as the ongoing operational source of truth.

## 1) Provision

- EC2 instance (Amazon Linux 2023 or Ubuntu 22.04+)
- Security group allows inbound app traffic (or ALB only)
- RDS Postgres reachable from EC2 subnet/security group

## 2) Install runtime

- Install Node.js 22
- Enable Corepack and install pnpm
- Clone repo to `/opt/projex`

## 3) Configure environment

Create `/etc/projex/projex.env`:

```bash
NODE_ENV=production
DATABASE_URL=postgres://user:password@host:5432/projex

# BetterAuth
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://app.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://app.example.com

# Browser/API origin allowlist
CORS_ALLOWED_ORIGINS=https://app.example.com

# Preferred: direct Resend delivery.
RESEND_API_KEY=
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM=

# Alternative invite/reset email delivery webhook.
PROJEX_AUTH_EMAIL_WEBHOOK_URL=
PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN=
PROJEX_AUTH_RESET_REDIRECT_URL=https://app.example.com/reset-password
PROJEX_APP_BASE_URL=https://app.example.com

# Must remain false in staging/production
PROJEX_ENABLE_DEV_ENDPOINTS=false
PROJEX_ENABLE_SMOKE_TOOLS=false
```

Notes:

- Keep `NODE_ENV=production` in deployed runtime env such as `/etc/projex/projex.env` or the systemd unit, not in repo `.env.production` / `.env.staging` files consumed by Vite.
- Do not deploy staging or production with development-only auth helpers enabled.
- Keep both `PROJEX_ENABLE_DEV_ENDPOINTS` and `PROJEX_ENABLE_SMOKE_TOOLS` disabled outside controlled local workflows.
- Set `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `CORS_ALLOWED_ORIGINS` to the canonical public origin users will actually visit.
- If nginx or another proxy fronts the app on `80/443`, use that public origin here rather than `:3000`.
- `PROJEX_AUTH_RESET_REDIRECT_URL` should point at the public reset page users will open from invite/reset emails.
- `PROJEX_APP_BASE_URL` should point at the public app origin used for transaction-comment notification links; it falls back to `BETTER_AUTH_URL` when unset.
- `RESEND_FROM` should be a verified sender, for example `Projex <noreply@projectexpensetracker.com>`.
- Run `pnpm run db:migrate` as an explicit deploy step before restarting the service; `pnpm run start:server` no longer auto-migrates by default.

## 4) Build + run

```bash
cd /opt/projex
corepack enable
pnpm install --frozen-lockfile
pnpm run build
```

Install systemd unit:

```bash
sudo cp deploy/systemd/projex.service /etc/systemd/system/projex.service
sudo systemctl daemon-reload
sudo systemctl enable projex
sudo systemctl start projex
```

Check logs:

```bash
sudo journalctl -u projex -f
```

`start:server` runs database migrations, serves built client assets, and starts the SSR app server (host/port via `HOST` and `PORT`, default `0.0.0.0:3000`).

If you front the app with nginx, proxy to `http://127.0.0.1:3000` and preserve `Host` plus standard forwarded headers.

Recommended:

- use the nginx template at `deploy/nginx/projex.conf`
- it includes:
  - HTTP -> HTTPS redirect
  - `server_tokens off`
  - site-wide security headers
  - proxy forwarding for host/origin/proto/IP
  - maintenance-page interception for upstream `502/503/504`
  - a dedicated `__maintenance_ready` probe endpoint that bypasses the maintenance fallback

The maintenance fallback relies on the static file:

- `deploy/nginx/maintenance.html`
- `deploy/nginx/maintenance.js`

In the repo template, nginx serves that file directly from:

- `/opt/projex/deploy/nginx/maintenance.html`
- `/opt/projex/deploy/nginx/maintenance.js`

So as long as the repo is deployed at `/opt/projex`, no extra copy step is required.

## 4.1) Repeatable deploy commands

Once the service is installed and `/etc/projex/projex.env` is configured, use one of these from `/opt/projex`:

```bash
# Full deploy: pull, install deps, migrate, build, restart, health checks
pnpm run deploy:ec2

# Faster deploy when dependencies did not change
pnpm run deploy:ec2:quick
```

The full deploy command performs:

- `git pull --ff-only`
- `pnpm install --frozen-lockfile`
- env load from `/etc/projex/projex.env`
- `pnpm run db:migrate`
- `pnpm run build`
- `sudo systemctl restart projex`
- `/api/health` and `/api/ready` checks
- recent `journalctl` output

Use `deploy:ec2:quick` only when `pnpm-lock.yaml` and runtime dependencies have not changed.

## 5) Health checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`

Use `/api/ready` for ALB target group health checks only if DB connectivity is required for serving.
The readiness response body is intentionally minimal; rely on the HTTP status code rather than detailed JSON fields.

## 5.1) CORS

- Same-origin requests are always allowed.
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` includes the exact origin.

## 5.2) Security headers

- For full browser hardening, terminate TLS at nginx and apply headers there for all HTML and API responses.
- The repo template `deploy/nginx/projex.conf` includes:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- a static maintenance-page `Content-Security-Policy`
- The SSR app server now emits the main app CSP per HTML response so it can attach a fresh nonce to inline scripts and runtime style tags.
- Review the CSP before adding third-party scripts, fonts, or image hosts.
- The current app CSP uses per-request nonces for `<script>` and `<style>` tags, but still allows style attributes because Mantine-rendered HTML uses inline `style=""` attributes at runtime.

## 5.3) Friendly restart page

The nginx template is set up to replace raw upstream restart errors with a static maintenance page.

How it works:

- normal app traffic proxies to `http://127.0.0.1:3000`
- if the app is unavailable and nginx would normally return `502`, `503`, or `504`
- nginx serves `deploy/nginx/maintenance.html` instead
- the maintenance response keeps the original upstream error status for health-check accuracy
- that page polls:
  - `/__maintenance_ready`
- once `/api/ready` is healthy again, the page redirects the browser back to the original URL

Why this matters:

- users do not see raw `502 Bad Gateway` during normal deploy or restart windows
- the maintenance page works even while the app process is down
- recovery is automatic once the app is healthy again

## 6) Post-deploy verification

For organisation handoff and the full operational checklist, use `docs/staging-runbook.md`.

Local or future-CI verification before you deploy:

```bash
pnpm run verify:security
pnpm run verify:ci
```

Use those like this:

- `pnpm run verify:security` is the fast non-Docker repo safety pass.
- `pnpm run verify:ci` is the fuller local or future-CI gate.
- The disposable DB commands are for local or CI use only; they are not part of the deployed EC2 runtime.

Before normal app verification on a fresh database, create the first global superadmin:

```bash
cd /opt/projex
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_AUTH_PASSWORD="replace-me" PROJEX_AUTH_NAME="Production Admin" pnpm run auth:create-user'
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" pnpm run auth:bootstrap-user'
```

Notes:

- `auth:create-user` creates the BetterAuth login.
- `auth:bootstrap-user` links that login into the app database and grants global superadmin.
- On a fresh database, sign-in alone is not enough; the account must also exist in app `users`.

- `pnpm run smoke:server` (from trusted network against deployed URL)
- `PROJEX_VERIFY_BASE_URL=https://app.example.com pnpm run verify:deploy-security`
- Prefer `pnpm run smoke:server:generated` for repeatable smoke runs. It creates disposable `smoke_*` users/company/project data, creates temporary programme/sub-project data in the targeted smoke section, runs smoke with generated `PROJEX_SMOKE_*` values, and cleans the fixtures in `finally`.
- Use `pnpm run smoke:cleanup` if an interrupted generated run leaves abandoned `smoke_*` fixtures behind.
- Save smoke-only credentials in `/opt/projex/.env.smoke.local` on EC2 only when you want to run the older configured-credential flow or the admin smoke UI. The CLI generated-fixture flow does not require long-lived smoke users.
- Use full smoke for broad confidence after deploy, and targeted section runs when retrying one workflow:
  - `pnpm run smoke:server -- --section=basics`
  - `pnpm run smoke:server -- --section=appPages`
  - `pnpm run smoke:server -- --section=emailChange`
  - `pnpm run smoke:server -- --section=temporaryData`
  - `pnpm run smoke:server -- --section=inviteFlow`
  - `pnpm run smoke:server -- --section=privacyChecks`
- Generated fixture runs can also be targeted with `pnpm run smoke:server:generated -- --section=inviteFlow`.
- If `PROJEX_SMOKE_RESET_EMAIL` is set, the smoke script will also verify that the password-reset request endpoint accepts that email.
- If `PROJEX_SMOKE_EMAIL_CHANGE_TO` is set, the smoke script will also verify the request / pending / resend / cancel email-change flow without actually switching the login email.
- If `PROJEX_SMOKE_INVITE_EMAIL` is set, the smoke script will also verify the company invite and resend-invite admin flow.
- If `PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL`, `PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD`, `PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL`, and `PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD` are set, the smoke script will also verify the project-level superadmin access toggle.
- Confirm auth/session, company scoping, transaction CRUD, taxonomy/budget CRUD, and programme rollups.
- `verify:deploy-security` checks the public deployment surface for:
  - `/api/health` and `/api/ready`
  - nonce-based CSP on `/login`
  - expected browser hardening headers
  - disabled `/api/dev/session`
  - non-public `/api/admin/smoke`
  - HTTP -> HTTPS redirect when verifying an HTTPS deployment
- Refresh test:
  - `/companies`
  - a company page
  - a project page
  - a budget page

Email change verification uses `PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL` when set, and otherwise falls back to `BETTER_AUTH_URL/verify-email-change`.

For local pre-deploy security hygiene before you even have staging up, run:

```bash
pnpm run verify:security
```

This bundles:

- repo env/config safety checks
- dependency audit
- test suite
- typecheck
- lint

When you want the fuller pipeline-shaped local check, run:

```bash
pnpm run verify:ci
```

That adds:

- production build
- disposable Postgres-backed DB integration tests
- disposable Postgres-backed isolated smoke basics
