# EC2 Deployment Guide

## 1) Provision

- EC2 instance (Amazon Linux 2023 or Ubuntu 22.04+)
- Security group allows inbound app traffic (or ALB only)
- RDS Postgres reachable from EC2 subnet/security group

## 2) Install runtime

- Install Node.js 22
- Install npm
- Clone repo to `/opt/projex`

## 3) Configure environment

Create `/etc/projex/projex.env`:

```bash
NODE_ENV=production
VITE_API_MODE=server
DATABASE_URL=postgres://user:password@host:5432/projex

# BetterAuth
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://app.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://app.example.com

# Browser/API origin allowlist
CORS_ALLOWED_ORIGINS=https://app.example.com

# Prefer direct request-scoped session resolution for SSR:
BETTER_AUTH_DIRECT_SESSION_FN=src/server/auth/authProvider.ts#getSessionFromRequest

# Optional fallback if you prefer an internal HTTP session check instead:
# BETTER_AUTH_SESSION_URL=http://127.0.0.1:3000/api/auth/get-session

# Preferred: direct Resend delivery.
RESEND_API_KEY=
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM=

# Alternative invite/reset email delivery webhook.
PROJEX_AUTH_EMAIL_WEBHOOK_URL=
PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN=
PROJEX_AUTH_RESET_REDIRECT_URL=https://app.example.com/reset-password

# Must remain false in staging/production
PROJEX_ENABLE_DEV_ENDPOINTS=false
```

Notes:

- Staging/production should run in `VITE_API_MODE=server`.
- Local seeded-user auth is for true local development only. Do not deploy staging in local mode.
- Set `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `CORS_ALLOWED_ORIGINS` to the canonical public origin users will actually visit.
- If nginx or another proxy fronts the app on `80/443`, use that public origin here rather than `:3000`.
- `PROJEX_AUTH_RESET_REDIRECT_URL` should point at the public reset page users will open from invite/reset emails.
- `RESEND_FROM` should be a verified sender, for example `Projex <noreply@projectexpensetracker.com>`.

## 4) Build + run

```bash
cd /opt/projex
npm ci
npm run build
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

## 4.1) Repeatable deploy commands

Once the service is installed and `/etc/projex/projex.env` is configured, use one of these from `/opt/projex`:

```bash
# Full deploy: pull, install deps, migrate, build, restart, health checks
npm run deploy:ec2

# Faster deploy when dependencies did not change
npm run deploy:ec2:quick
```

The full deploy command performs:

- `git pull --ff-only`
- `npm ci`
- env load from `/etc/projex/projex.env`
- `npm run db:migrate`
- `npm run build`
- `sudo systemctl restart projex`
- `/api/health` and `/api/ready` checks
- recent `journalctl` output

Use `deploy:ec2:quick` only when `package-lock.json` and runtime dependencies have not changed.

## 5) Health checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`

Use `/api/ready` for ALB target group health checks only if DB connectivity is required for serving.

## 5.1) CORS

- Same-origin requests are always allowed.
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` includes the exact origin.

## 6) Post-deploy verification

- `npm run smoke:server` (from trusted network against deployed URL)
- If `PROJEX_SMOKE_RESET_EMAIL` is set, the smoke script will also verify that the password-reset request endpoint accepts that email.
- Confirm auth/session, company scoping, transaction CRUD, taxonomy/budget CRUD.
- Refresh test:
  - `/companies`
  - a company page
  - a project page
  - a budget page
