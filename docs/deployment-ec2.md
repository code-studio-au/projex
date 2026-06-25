# EC2 Deployment Guide

Use this guide for first-time EC2/RDS host provisioning. Once the host, systemd unit, nginx, and environment file exist, use `docs/staging-runbook.md` as the ongoing operational source of truth.

## 1) Provision

- EC2 instance (Amazon Linux 2023 or Ubuntu 22.04+)
- Security group allows inbound app traffic (or ALB only)
- RDS Postgres reachable from EC2 subnet/security group

## 2) Install runtime

- Install Node.js 22
- Enable Corepack and install pnpm
- Create app directories:
  - `/opt/projex/releases`
  - `/opt/projex/shared/nginx-maintenance`
  - `/opt/projex/current` as the active symlink target created by deploys
- Keep a repo checkout available for first-time bootstrap and reference, or copy the needed deployment files from the repo:
  - `deploy/systemd/projex.service`
  - `deploy/nginx/projex.conf`

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

# Company export object storage
S3_BUCKET=projex-exports
S3_REGION=ap-southeast-2

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
- `S3_BUCKET` and `S3_REGION` are required for the export feature when using AWS S3. On AWS itself you normally do not need to set `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, or `S3_FORCE_PATH_STYLE`.
- `RESEND_FROM` should be a verified sender, for example `Projex <noreply@projectexpensetracker.com>`.
- Run `pnpm run db:migrate` as an explicit deploy step before restarting the service; `pnpm run start:server` no longer auto-migrates by default.

Sizing guidance:

- cheapest sensible default for the current repo shape: `t4g.small` app host plus separate `db.t4g.micro` RDS
- artifact-based deploys remove the heaviest on-box build pressure because the instance no longer runs `pnpm run build` during each release
- once deploys are artifact-based and the instance is mostly a runtime host, `t4g.micro` becomes much more realistic as a lowest-cost option, subject to your real traffic and memory profile

## 4) Bootstrap + run

```bash
sudo mkdir -p /opt/projex/releases /opt/projex/shared/nginx-maintenance
sudo chown -R ec2-user:ec2-user /opt/projex
corepack enable
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

`start:server` validates the runtime env, serves built client assets, and starts the SSR app server (host/port via `HOST` and `PORT`, default `0.0.0.0:3000`). It does not run migrations unless `PROJEX_RUN_MIGRATIONS=true` is set explicitly.

The systemd unit now points at `/opt/projex/current`, so each deploy activates a fully extracted release directory by switching that symlink after migrations succeed.

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

In the recommended artifact-based layout, nginx serves those files from:

- `/opt/projex/shared/nginx-maintenance/maintenance.html`
- `/opt/projex/shared/nginx-maintenance/maintenance.js`

Each deploy refreshes those shared maintenance assets from the release bundle before the service restart.

## 4.1) Repeatable deploy commands

Preferred path: build the release artifact in CI and deploy that artifact onto the host.

Local packaging command:

```bash
pnpm run build
pnpm run deploy:artifact:create
```

GitHub Actions manual workflow:

- `.github/workflows/deploy.yml`
- default mode: `artifact-only`
- optional mode when secrets are ready: `ec2`

When enabling the `ec2` mode, set repository or environment secrets for:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_PRIVATE_KEY`
- optional overrides such as `EC2_PORT`, `EC2_APP_ROOT`, `EC2_ENV_FILE`, `EC2_SERVICE_NAME`, `EC2_HEALTH_URL`, `EC2_READY_URL`, `EC2_KEEP_RELEASES`, and `EC2_SSH_KNOWN_HOST`

The artifact-based release flow performs:

- build once in GitHub Actions
- package a deploy tarball containing `dist`, runtime source, migrations, scripts, and nginx maintenance assets
- upload the artifact to the target host
- extract into `/opt/projex/releases/<release-id>`
- `pnpm install --frozen-lockfile --prod`
- env load from `/etc/projex/projex.env`
- `pnpm run db:migrate`
- refresh shared maintenance assets
- switch `/opt/projex/current`
- restart `projex`
- `/api/health` and `/api/ready` checks
- rollback to the previous release symlink if restart or health checks fail

Legacy build-on-host fallback remains available from a full repo checkout:

```bash
pnpm run deploy:ec2
pnpm run deploy:ec2:quick
```

The legacy build-on-host command performs:

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

## 6) Ongoing Operations

For post-deploy verification, first-admin bootstrap, smoke usage, and troubleshooting, use [docs/staging-runbook.md](/Users/scas0196/Documents/code/projex/docs/staging-runbook.md:1).

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
- disposable Postgres-backed isolated server smoke basics
- disposable Postgres-backed isolated browser smoke basics
