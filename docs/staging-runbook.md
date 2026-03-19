# Production Runbook

This runbook captures the current known-good deployed setup on the canonical production domain after the server-auth and HTTPS cutover work.

## Checkpoint

- Current stable checkpoint tag: `staging-auth-stable-2026-03-17`

## Canonical Production URL

- Use the public nginx-fronted HTTPS origin, not direct `:3000`, for normal access.
- Canonical URL:
  - `https://projectexpensetracker.com`

## Auth Model

- Production runs in real server auth mode.
- Local seeded-user auth remains available for local development only.
- Do not deploy production with local auth semantics.

## Required Production Env

`/etc/projex/projex.env` should include at least:

```bash
NODE_ENV=production
VITE_API_MODE=server

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
8. Optional invite smoke:
   - set `PROJEX_SMOKE_INVITE_EMAIL`
   - run `npm run smoke:server`
   - confirm invite + resend-invite requests both succeed
9. Optional privacy-toggle smoke:
   - set `PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL`
   - set `PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD`
   - set `PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL`
   - set `PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD`
   - run `npm run smoke:server`
   - confirm the script can disable superadmin project access, verify superadmin loses access, and restore the original setting

## Create A Production Login

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

Use a less privileged template user if you want a narrower production role.

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

If login works but refresh breaks:

- check `/etc/projex/projex.env`
- confirm `VITE_API_MODE=server`
- confirm `BETTER_AUTH_DIRECT_SESSION_FN` is set
- confirm `PROJEX_ENABLE_DEV_ENDPOINTS=false`

## Intentional Local/Server Split

- Local development:
  - local seeded auth
  - local data state
- Production:
  - BetterAuth sign-in
  - request-scoped server session checks
  - no dev endpoints

That split is intentional. Avoid “server pretending to be local” configuration in production.
