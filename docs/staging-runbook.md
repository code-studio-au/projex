# Staging and Production Runbook

This is the operational source of truth for deployed Projex environments. It covers runtime readiness, deploys, post-deploy verification, first-admin bootstrap, and common troubleshooting.

## Checkpoint

- Last known stable checkpoint tag: `staging-auth-stable-2026-03-17`

## Canonical Production URL

- Use the public nginx-fronted HTTPS origin, not direct `:3000`, for normal access.
- Canonical URL:
  - `https://projectexpensetracker.com`

## Auth Model

- Deployed environments run in real server auth mode.
- Development-only auth helpers may be used locally, but staging should use real auth flows.
- Do not deploy production with local auth semantics.

## Readiness Checklist

Before cutting over or handing a deployed environment to another developer, confirm:

- `DATABASE_URL` points at the target Postgres instance.
- `NODE_ENV=production` is supplied by runtime env or systemd, not committed repo env files consumed by Vite.
- `BETTER_AUTH_SECRET` is present and generated from a strong random value.
- `BETTER_AUTH_URL` is the canonical public origin users will visit.
- `BETTER_AUTH_DIRECT_SESSION_FN` is configured, or `BETTER_AUTH_SESSION_URL` is intentionally used as the fallback.
- `PROJEX_ENABLE_DEV_ENDPOINTS` is `false` or unset outside controlled local workflows.
- `CORS_ALLOWED_ORIGINS` only includes explicit trusted browser origins.
- `npm run db:migrate` has run successfully against the target database.
- The first app-side global superadmin has been created with `npm run auth:bootstrap-user` on fresh databases.
- Unauthorized requests return `401` and scoped resources are not visible across companies/projects.
- The public proxy uses `deploy/nginx/projex.conf` or equivalent HTTPS redirect, forwarded headers, hardening headers, and maintenance fallback behavior.
- `/api/health` returns `200` when the process is running.
- `/api/ready` returns `200` only when environment and database checks pass.
- `/api/ready` exposes minimal public detail; use the status code for probes.

Pre-deploy verification from a clean local checkout:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Post-deploy verification on the target runtime:

```bash
npm run smoke:server
```

Use targeted sections when retrying one workflow:

```bash
npm run smoke:server -- --section=basics
npm run smoke:server -- --section=appPages
npm run smoke:server -- --section=emailChange
npm run smoke:server -- --section=temporaryData
npm run smoke:server -- --section=inviteFlow
npm run smoke:server -- --section=privacyChecks
```

Keep smoke credentials in `.env.smoke.local` at the repo root. On EC2 that is `/opt/projex/.env.smoke.local`.

## Required Production Env

`/etc/projex/projex.env` should include at least:

```bash
NODE_ENV=production

DATABASE_URL=postgres://...

BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://projectexpensetracker.com
BETTER_AUTH_TRUSTED_ORIGINS=https://projectexpensetracker.com,https://www.projectexpensetracker.com
CORS_ALLOWED_ORIGINS=https://projectexpensetracker.com,https://www.projectexpensetracker.com

BETTER_AUTH_DIRECT_SESSION_FN=src/server/auth/authProvider.ts#getSessionFromRequest

# Preferred: direct Resend delivery.
RESEND_API_KEY=
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM=

# Alternative invite/reset delivery webhook.
PROJEX_AUTH_EMAIL_WEBHOOK_URL=
PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN=
PROJEX_AUTH_RESET_REDIRECT_URL=https://projectexpensetracker.com/reset-password

PROJEX_ENABLE_DEV_ENDPOINTS=false
```

Notes:

- Keep `NODE_ENV=production` in `/etc/projex/projex.env` for deployed runtime, but do not rely on repo `.env.production` / `.env.staging` files for that setting during Vite builds.
- If you need direct port testing temporarily, you can include both origins in:
  - `BETTER_AUTH_TRUSTED_ORIGINS`
  - `CORS_ALLOWED_ORIGINS`
- For normal production use, prefer the canonical public origin only.
- Use the nginx template at `deploy/nginx/projex.conf` as the baseline reverse-proxy config for:
  - HTTP -> HTTPS redirect
  - `server_tokens off`
  - site-wide security headers
  - forwarded host/proto/IP headers
  - maintenance fallback page during upstream restart windows

## Deploy

From `/opt/projex`:

```bash
# Full deploy
npm run deploy:ec2

# Faster deploy if dependencies definitely did not change
npm run deploy:ec2:quick
```

## Manual Deploy Fallback

```bash
cd /opt/projex
git pull --ff-only
sudo sh -c 'cd /opt/projex && set -a && . /etc/projex/projex.env && set +a && npm run build'
sudo systemctl restart projex
sudo systemctl status projex --no-pager -l
```

## Post-Deploy Smoke Test

1. Open `/login`
2. Sign in with a linked BetterAuth user
3. Confirm redirect to `/companies`
4. Open a company
5. Open a project
6. Refresh:
   - `/companies`
   - company page
   - project page
   - budget page
7. Password reset:
   - click `Forgot password?`
   - request a reset email
   - open the link
   - set a new password
   - for saved smoke credentials, put the `PROJEX_SMOKE_*` values in `.env.smoke.local` at the repo root (`/opt/projex/.env.smoke.local` on EC2, repo root locally)
   - use `npm run smoke:server` for a full pass
   - use `npm run smoke:server -- --section=...` when rerunning only one workflow
8. Optional invite smoke:
   - set `PROJEX_SMOKE_INVITE_EMAIL`
   - run `npm run smoke:server -- --section=inviteFlow`
   - confirm invite + resend-invite requests both succeed
9. Optional email-change smoke:
   - set `PROJEX_SMOKE_EMAIL_CHANGE_TO`
   - run `npm run smoke:server -- --section=emailChange`
   - confirm the script can request, detect, resend, and cancel a pending email change
10. Optional privacy-toggle smoke: set `PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL`, `PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD`, `PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL`, and `PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD`, then run `npm run smoke:server -- --section=privacyChecks`.

## Create The First Global Superadmin

Create a BetterAuth user:

```bash
cd /opt/projex
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_AUTH_PASSWORD="replace-me" PROJEX_AUTH_NAME="Staging User" npm run auth:create-user'
```

Bootstrap that BetterAuth user into the app as a global superadmin.
On a fresh database, this is the required step that makes the account usable in the app and able to see `/companies`.

```bash
cd /opt/projex
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" npm run auth:bootstrap-user'
```

Notes:

- `npm run auth:bootstrap-user` creates or updates the app-side `users` row and sets `is_global_superadmin = true`.
- The optional bootstrap company/project values are just a convenient starting point; the global-superadmin grant is the important part.
- If you skip this step on a fresh database, sign-in may succeed in BetterAuth but the account will not see any companies in the app.

If you already have an app-side template user and want to copy its memberships instead, keep using `npm run auth:link-user` with `PROJEX_APP_TEMPLATE_USER_ID`. That command also grants global superadmin to the linked BetterAuth user.

## Company Invites

- Inviting a user from company settings will:
  - create or reuse a BetterAuth user
  - reconcile/link the app `users` row to the BetterAuth user id
  - add company membership
  - send a password setup email
- Existing company members can also be re-sent an invite email from company settings.
- Prefer direct Resend delivery with:
  - `RESEND_API_KEY`
  - `RESEND_BASE_URL=https://api.resend.com`
  - `RESEND_FROM` as the verified sender address
- If neither Resend nor `PROJEX_AUTH_EMAIL_WEBHOOK_URL` is configured, the password setup link is logged on the server instead.
- For email troubleshooting and direct provider checks, see `docs/email-ops-runbook.md`.

## Rotate BetterAuth Secret

Generate a new secret:

```bash
openssl rand -base64 48
```

Update:

- `/etc/projex/projex.env`
- any local non-committed env files you use for development

Then rebuild and restart:

```bash
cd /opt/projex
sudo sh -c 'cd /opt/projex && set -a && . /etc/projex/projex.env && set +a && npm run build'
sudo systemctl restart projex
```

Expected effect:

- existing BetterAuth sessions are invalidated
- users must sign in again

## Troubleshooting

If the app is up locally on EC2 but not from the browser:

```bash
curl -i http://127.0.0.1:3000/login
curl -i https://projectexpensetracker.com/login
sudo systemctl status projex --no-pager -l
sudo journalctl -u projex -n 100 --no-pager
```

If browser hardening headers are missing:

```bash
curl -I https://projectexpensetracker.com/login
```

Expected at minimum:

- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options` or CSP `frame-ancestors`
- `Referrer-Policy`
- `Permissions-Policy`

If the app is restarting and you want the user-facing fallback to remain polished:

- keep `deploy/nginx/maintenance.html` present on the host
- keep nginx configured with:
  - `proxy_intercept_errors on`
  - `error_page 502 503 504 =200 /__maintenance.html`
  - `location = /__maintenance_ready` proxied to `/api/ready` with `proxy_intercept_errors off`

Expected behavior:

- user requests a normal app route during restart
- nginx serves the maintenance page instead of raw `502`
- the page polls `/__maintenance_ready`
- once the app is healthy again, the page redirects back to the original URL automatically

If login works but refresh breaks:

- check `/etc/projex/projex.env`
- confirm `BETTER_AUTH_DIRECT_SESSION_FN` is set
- confirm `PROJEX_ENABLE_DEV_ENDPOINTS=false`

## Intentional Local/Server Split

- Local development:
  - BetterAuth or dev-only bootstrap helpers
  - server-backed data flow
- Production:
  - BetterAuth sign-in
  - request-scoped server session checks
  - no dev endpoints

That split is intentional. Avoid “server pretending to be local” configuration in production.

Email change verification uses `PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL` when set, and otherwise falls back to `BETTER_AUTH_URL/verify-email-change`.
