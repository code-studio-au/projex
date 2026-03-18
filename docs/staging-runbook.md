# Staging Runbook

This runbook captures the current known-good staging setup after the server-auth stabilization work.

## Checkpoint

- Current stable checkpoint tag: `staging-auth-stable-2026-03-17`

## Canonical Staging URL

- Use the public nginx-fronted origin, not direct `:3000`, for normal staging access.
- Example:
  - `http://54.66.124.216`

## Auth Model

- Staging runs in real server auth mode.
- Local seeded-user auth remains available for local development only.
- Do not deploy staging with local auth semantics.

## Required Staging Env

`/etc/projex/projex.env` should include at least:

```bash
NODE_ENV=production
VITE_API_MODE=server

DATABASE_URL=postgres://...

BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=http://54.66.124.216
BETTER_AUTH_TRUSTED_ORIGINS=http://54.66.124.216
CORS_ALLOWED_ORIGINS=http://54.66.124.216

BETTER_AUTH_DIRECT_SESSION_FN=src/server/auth/authProvider.ts#getSessionFromRequest

# Preferred: direct Resend delivery.
RESEND_API_KEY=
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM=

# Alternative invite/reset delivery webhook.
PROJEX_AUTH_EMAIL_WEBHOOK_URL=
PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN=
PROJEX_AUTH_RESET_REDIRECT_URL=http://54.66.124.216/reset-password

PROJEX_ENABLE_DEV_ENDPOINTS=false
```

Notes:

- If you need direct port testing temporarily, you can include both origins in:
  - `BETTER_AUTH_TRUSTED_ORIGINS`
  - `CORS_ALLOWED_ORIGINS`
- For normal staging use, prefer the canonical public origin only.

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

## Create A Staging Login

Create a BetterAuth user:

```bash
cd /opt/projex
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_AUTH_PASSWORD="replace-me" PROJEX_AUTH_NAME="Staging User" npm run auth:create-user'
```

Link that BetterAuth user to app memberships:

```bash
cd /opt/projex
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_APP_TEMPLATE_USER_ID="u_superadmin" npm run auth:link-user'
```

Use a less privileged template user if you want a narrower staging role.

## Company Invites

- Inviting a user from company settings will:
  - create or reuse a BetterAuth user
  - reconcile/link the app `users` row to the BetterAuth user id
  - add company membership
  - send a password setup email for newly-created auth users
- Prefer direct Resend delivery with:
  - `RESEND_API_KEY`
  - `RESEND_BASE_URL=https://api.resend.com`
  - `RESEND_FROM` as the verified sender address
- If neither Resend nor `PROJEX_AUTH_EMAIL_WEBHOOK_URL` is configured, the password setup link is logged on the server instead.

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
curl -i http://54.66.124.216/login
sudo systemctl status projex --no-pager -l
sudo journalctl -u projex -n 100 --no-pager
```

If login works but refresh breaks:

- check `/etc/projex/projex.env`
- confirm `VITE_API_MODE=server`
- confirm `BETTER_AUTH_DIRECT_SESSION_FN` is set
- confirm `PROJEX_ENABLE_DEV_ENDPOINTS=false`

## Intentional Local/Server Split

- Local development:
  - local seeded auth
  - local data state
- Staging/production:
  - BetterAuth sign-in
  - request-scoped server session checks
  - no dev endpoints

That split is intentional. Avoid “server pretending to be local” configuration in staging.
