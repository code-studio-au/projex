# Staging and Production Runbook

This is the operational source of truth for deployed Projex environments. It covers runtime readiness, deploys, post-deploy verification, first-admin bootstrap, and common troubleshooting.

## Organisation Handoff Checklist

Before handing this repo to another developer or team, make sure:

- local verification is green:
  - `pnpm run verify:security`
  - `pnpm run verify:ci`
- required runtime secrets and envs are known and documented:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `BETTER_AUTH_TRUSTED_ORIGINS`
  - `CORS_ALLOWED_ORIGINS`
  - export-storage envs when company export is enabled: `S3_BUCKET`, `S3_REGION`, and any endpoint/credential overrides
- production-only expectations are understood:
  - `PROJEX_ENABLE_DEV_ENDPOINTS=false`
  - `PROJEX_ENABLE_SMOKE_TOOLS=false`
  - secrets come from the org-managed secret store, not committed files
  - the app DB user should be least-privilege and not a superuser
  - only nginx/public ports should be browser-facing
- the eventual pipeline shape is clear:
  - local/CI gate: `pnpm run verify:ci`
  - GitHub Actions CI: static checks, CDK verification, DB verification, full disposable server smoke, and full disposable browser smoke
  - GitHub Actions deploy artifact build: reruns `verify:app`, `verify:cdk`, `verify:db:gate`, full disposable server smoke, and full disposable browser smoke before packaging
  - deployed-environment checks: `pnpm run smoke:server` and `pnpm run verify:deploy-security`
- normal code flow is branch -> PR -> green checks -> merge; protected `main` is not the routine delivery path
- the first-admin bootstrap path is understood for fresh databases:
  - `pnpm run auth:create-user`
  - `pnpm run auth:bootstrap-user`

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
- `/etc/projex/projex.env` contains real values rather than the bootstrap example placeholders.
- `BETTER_AUTH_SECRET` is present and generated from a strong random value.
- `BETTER_AUTH_URL` is the canonical public origin users will visit.
- `BETTER_AUTH_TRUSTED_ORIGINS` contains only the canonical public origin(s) that should be allowed to complete auth flows.
- `PROJEX_ENABLE_DEV_ENDPOINTS` is `false` or unset outside controlled local workflows.
- `PROJEX_ENABLE_SMOKE_TOOLS` is `false` or unset outside controlled local workflows.
- `CORS_ALLOWED_ORIGINS` only includes explicit trusted browser origins.
- `pnpm run db:migrate` has run successfully against the target database.
- `pnpm run db:verify-types` passes locally after any schema change before handoff or deploy.
- The first app-side global superadmin has been created with `pnpm run auth:bootstrap-user` on fresh databases.
- Unauthorized requests return `401` and scoped resources are not visible across companies/projects.
- The public proxy uses `deploy/nginx/projex.conf` or equivalent HTTPS redirect, forwarded headers, hardening headers, and maintenance fallback behavior.
- Nginx loads `/etc/nginx/conf.d/projex-request-limits.conf`, which keeps application request bodies bounded at `16m` while allowing validated bulk import commits.
- If the host was created through CDK, the HTTP bootstrap nginx config has been promoted to HTTPS with `/usr/local/bin/projex-provision-letsencrypt-cert`.
- `/api/health` returns `200` when the process is running.
- `/api/ready` returns `200` only when environment and database checks pass.
- `/api/ready` exposes minimal public detail; use the status code for probes.

Pre-deploy verification from a clean local checkout:

```bash
pnpm run verify:security
pnpm run verify:ci
```

How to think about those commands:

- `pnpm run verify:security` is the fast non-Docker pass for repo config, audit, tests, typecheck, and lint.
- `pnpm run verify:ci` is the fuller local/CI-shaped pass. It adds build,
  CDK synth verification, disposable DB integration tests, isolated full
  disposable server smoke, and isolated full disposable browser smoke.
- Both disposable DB steps require local Docker access.
- Local browser smoke also needs `pnpm exec playwright install --with-deps chromium`
  the first time you run it on a machine.
- `pnpm run db:migrate` remains an explicit deployment step; the runtime server should be restarted only after migrations succeed.

Post-deploy verification on the target runtime:

```bash
pnpm run smoke:server
```

For the default repeatable path on a deployed EC2 host, prefer generated
fixtures from the activated release:

```bash
cd /opt/projex/current
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; pnpm run smoke:server:generated'
```

The deploy artifact now includes the server smoke CLI entrypoint, so these
commands are expected to work directly on-host after a successful deploy.

Public deployment-surface verification:

```bash
PROJEX_VERIFY_BASE_URL=https://projectexpensetracker.com pnpm run verify:deploy-security
```

Optional authenticated deployment verification:

```bash
PROJEX_VERIFY_BASE_URL=https://projectexpensetracker.com \
PROJEX_VERIFY_AUTH_EMAIL=smoke-or-test-user@example.com \
PROJEX_VERIFY_AUTH_PASSWORD=replace-me \
pnpm run verify:deploy-security
```

When auth credentials are provided, the verifier also checks that sign-in sets `HttpOnly` cookies, requires `Secure` on HTTPS deployments, and that authenticated `/api/session` returns a `userId`.

GitHub Actions deploys expect these environment secrets on the target GitHub
environment when `deploy_target=ec2` is used:

- preferred AWS auth:
  - `AWS_DEPLOY_ROLE_ARN`
- fallback AWS auth:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - optional `AWS_SESSION_TOKEN`
- `EC2_INSTANCE_ID`
- `EC2_DEPLOY_ARTIFACT_BUCKET`
- `EC2_ENV_FILE`
  - Optional override; default `/etc/projex/projex.env`
- `EC2_APP_ROOT`
  - Optional override; default `/opt/projex`
- `EC2_SERVICE_NAME`
  - Optional override; default `projex`
- `EC2_HEALTH_URL`
  - Optional override; default `http://127.0.0.1:3000/api/health`
- `EC2_READY_URL`
  - Optional override; default `http://127.0.0.1:3000/api/ready`
- `EC2_KEEP_RELEASES`
  - Optional override; default `5`
- `EC2_PUBLIC_BASE_URL`
  - The public HTTPS origin that users visit, for example `https://projectexpensetracker.com`
  - Used by the post-deploy `verify-deploy-security` step from the runner
- `EC2_VERIFY_AUTH_EMAIL`
  - Optional smoke/test user email for authenticated cookie/session verification
- `EC2_VERIFY_AUTH_PASSWORD`
  - Optional password paired with `EC2_VERIFY_AUTH_EMAIL`

Recommended setup:

- create one GitHub environment per deploy target, for example `staging` or
  `production`
- store the EC2 and AWS deploy secrets on that environment rather than as
  repo-wide secrets
- prefer `AWS_DEPLOY_ROLE_ARN` via OIDC and leave the static-key fallback
  empty unless you truly need it
- point `EC2_DEPLOY_ARTIFACT_BUCKET` at the CDK output
  `DeployArtifactBucketName`
- keep the EC2 host SSM-enabled and do not rely on SSH for normal releases

For the most repeatable run, use generated smoke fixtures. This creates
disposable `smoke_*` users/company/project data, creates temporary
programme/sub-project records in the temporary-data section, injects the
matching `PROJEX_SMOKE_*` values for the process, runs smoke, then cleans the
fixtures in `finally`:

```bash
pnpm run smoke:server:generated
```

Generated fixture runs can also be targeted:

```bash
pnpm run smoke:server:generated -- --section=inviteFlow
```

Use targeted sections when retrying one workflow:

```bash
pnpm run smoke:server -- --section=basics
pnpm run smoke:server -- --section=appPages
pnpm run smoke:server -- --section=emailChange
pnpm run smoke:server -- --section=temporaryData
pnpm run smoke:server -- --section=inviteFlow
pnpm run smoke:server -- --section=privacyChecks
```

For the complete disposable server sweep across every smoke section, use:

```bash
pnpm run verify:smoke:full
```

If you already have a fresh build and only want to rerun the sweep itself:

```bash
pnpm run verify:smoke:full:skip-build
```

Keep smoke credentials in `.env.smoke.local` at the active repo root. On EC2
that is `/opt/projex/current/.env.smoke.local`, because the packaged smoke CLI
loads overrides from the activated release working directory.
Generated fixture runs still require the normal deployed runtime env, including `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`. If interrupted smoke runs leave data behind, run:

```bash
pnpm run smoke:cleanup
```

Use the smoke commands like this:

- `pnpm run smoke:server:disposable` is for local or CI use when you want full isolation from shared databases. In local runs it now provisions a temporary `https://localhost` origin automatically so production-mode auth validation and readiness checks stay aligned.
- `pnpm run smoke:server:generated` is the default repeatable path for an already-running app/database. It creates and cleans disposable `smoke_*` fixture rows in normal tables.
- `pnpm run smoke:server` is the advanced manual path for targeted runtime verification against a real deployed environment.
- In the admin Smoke dashboard, generated fixtures are the default run mode. Manual mode is the advanced fallback and accepts per-run inputs in the UI rather than requiring repo-local smoke env values.

## Required Production Env

`/etc/projex/projex.env` should include at least:

```bash
NODE_ENV=production

DATABASE_URL=postgres://...
PG_POOL_MAX=10
PG_IDLE_TIMEOUT_MS=30000
PG_CONNECTION_TIMEOUT_MS=5000
PG_SSL_MODE=require
# PG_SSL_CA_FILE=/etc/projex/postgres-ca.crt

BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://projectexpensetracker.com
BETTER_AUTH_TRUSTED_ORIGINS=https://projectexpensetracker.com,https://www.projectexpensetracker.com
CORS_ALLOWED_ORIGINS=https://projectexpensetracker.com,https://www.projectexpensetracker.com

# Preferred: direct Resend delivery.
RESEND_API_KEY=
RESEND_BASE_URL=https://api.resend.com
RESEND_FROM=

# Alternative invite/reset delivery webhook.
PROJEX_AUTH_EMAIL_WEBHOOK_URL=
PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN=
PROJEX_AUTH_RESET_REDIRECT_URL=https://projectexpensetracker.com/reset-password
PROJEX_APP_BASE_URL=https://projectexpensetracker.com

PROJEX_ENABLE_DEV_ENDPOINTS=false
PROJEX_ENABLE_SMOKE_TOOLS=false

# Company export object storage
S3_BUCKET=projex-exports
S3_REGION=ap-southeast-2
# Optional for S3-compatible providers such as MinIO:
# S3_ENDPOINT=
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_FORCE_PATH_STYLE=
```

Notes:

- Keep `NODE_ENV=production` in `/etc/projex/projex.env` for deployed runtime, but do not rely on repo `.env.production` / `.env.staging` files for that setting during Vite builds.
- If you need direct port testing temporarily, you can include both origins in:
  - `BETTER_AUTH_TRUSTED_ORIGINS`
  - `CORS_ALLOWED_ORIGINS`
- For normal production use, prefer the canonical public origin only.
- Company export readiness depends on the configured object-storage bucket existing and being reachable from the app runtime.
- Leave `PG_SSL_MODE=require` in normal production/staging. For a private or self-signed CA, set `PG_SSL_CA_FILE` to its mounted CA certificate; reserve `no-verify` for an explicit last-resort exception.
- Use the nginx template at `deploy/nginx/projex.conf` as the baseline reverse-proxy config for:
  - HTTP -> HTTPS redirect
  - `server_tokens off`
  - site-wide security headers
  - forwarded host/proto/IP headers
  - maintenance fallback page during upstream restart windows

## Deploy

Preferred: trigger the manual GitHub Actions deploy workflow
`.github/workflows/deploy.yml`.

Preferred deploy model:

- resolve the checked-out commit once and pass its immutable SHA through every
  job
- build once in GitHub Actions and embed the SHA, run ID, and attempt in the
  release manifest
- upload the prebuilt release artifact to S3
- dispatch an SSM command to the EC2 host
- verify the artifact checksum and identity before atomically promoting a fresh
  staging directory
- install runtime dependencies only on the host
- run migrations
- refresh the managed nginx request-limit include, validate nginx, and reload it
- atomically switch the `/opt/projex/current` symlink without overwriting any
  existing release
- restart the service

The activated release under `/opt/projex/current` also includes the server
smoke CLI entrypoint, so post-deploy smoke can run against the real deployed
runtime without requiring a separate repo checkout on the host.

The deploy runner does not SSH into the box. The only moving parts are:

- GitHub Actions runner with AWS credentials
- S3 deploy handoff bucket
- SSM-enabled EC2 instance profile with access to read that bucket

This is the single supported deployment path. The repo no longer supports a
build-on-host fallback for routine or emergency releases.

## Post-Deploy Smoke Test

1. Open `/login`
2. Sign in with a linked BetterAuth user
3. Confirm redirect to `/companies`
4. Open a company
5. Open a project or programme
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
8. Prefer generated fixture smoke for the default repeatable full pass without long-lived smoke users:
   - run `pnpm run smoke:server:generated`
   - use `pnpm run smoke:server:generated -- --section=...` when rerunning only one generated-fixture workflow
   - run `pnpm run smoke:cleanup` if an interrupted generated run leaves abandoned `smoke_*` fixtures behind
9. Use manual smoke only when you explicitly want to target existing users or long-lived data:
   - for CLI/manual mode, put the `PROJEX_SMOKE_*` values in `.env.smoke.local` at the repo root (`/opt/projex/current/.env.smoke.local` on EC2, repo root locally)
   - run `pnpm run smoke:server`
   - use `pnpm run smoke:server -- --section=...` when rerunning only one manual workflow
10. Optional configured-credential invite smoke:

- set `PROJEX_SMOKE_INVITE_EMAIL`
- run `pnpm run smoke:server -- --section=inviteFlow`
- confirm invite + resend-invite requests both succeed

11. Optional configured-credential email-change smoke:

- set `PROJEX_SMOKE_EMAIL_CHANGE_TO`
- run `pnpm run smoke:server -- --section=emailChange`
- confirm the script can request, detect, resend, and cancel a pending email change

12. Optional configured-credential privacy-toggle smoke: set `PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL`, `PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD`, `PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL`, and `PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD`, then run `pnpm run smoke:server -- --section=privacyChecks`.
13. Optional company export smoke:

- run `pnpm run smoke:server -- --section=exportFlow`
- confirm the export completes, reports positive file metadata, and downloads from object storage successfully

## Create The First Global Superadmin

Create a BetterAuth user:

```bash
cd /opt/projex/current
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_AUTH_PASSWORD="replace-me" PROJEX_AUTH_NAME="Staging User" pnpm run auth:create-user'
```

Bootstrap that BetterAuth user into the app as a global superadmin.
On a fresh database, this is the required step that makes the account usable in the app and able to see `/companies`.

```bash
cd /opt/projex/current
sudo sh -c 'set -a; . /etc/projex/projex.env; set +a; PROJEX_AUTH_EMAIL="name@example.com" PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" pnpm run auth:bootstrap-user'
```

Notes:

- `pnpm run auth:bootstrap-user` creates or updates the app-side `users` row and sets `is_global_superadmin = true`.
- The optional bootstrap company/project values are just a convenient starting point; the global-superadmin grant is the important part.
- If you skip this step on a fresh database, sign-in may succeed in BetterAuth but the account will not see any companies in the app.

If you already have an app-side template user and want to copy its memberships instead, keep using `pnpm run auth:link-user` with `PROJEX_APP_TEMPLATE_USER_ID`. That command also grants global superadmin to the linked BetterAuth user.

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
- Transaction comment assignment emails use `PROJEX_APP_BASE_URL` for deep links and fall back to `BETTER_AUTH_URL` when it is not set.
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

Then restart the live service so it reloads the runtime env:

```bash
sudo systemctl restart projex
```

Expected effect:

- existing BetterAuth sessions are invalidated
- users must sign in again

## Troubleshooting

If accepting an import returns nginx `413 Request Entity Too Large`, confirm the
managed request-limit include is active:

```bash
sudo cat /etc/nginx/conf.d/projex-request-limits.conf
sudo nginx -T | grep client_max_body_size
```

The expected value is `client_max_body_size 16m;`. Routine artifact deployment
installs this file and reloads nginx. To recover a host from an already
activated release manually, run:

```bash
sudo install -m 0644 \
  /opt/projex/current/deploy/nginx/projex-request-limits.conf \
  /etc/nginx/conf.d/projex-request-limits.conf
sudo nginx -t
sudo systemctl reload nginx
```

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
- keep `deploy/nginx/maintenance.js` present on the host
- keep nginx configured with:
  - `proxy_intercept_errors on`
  - `error_page 502 503 504 /__maintenance.html`
  - `location = /__maintenance_ready` proxied to `/api/ready` with `proxy_intercept_errors off`

Expected behavior:

- user requests a normal app route during restart
- nginx serves the maintenance page with the original upstream `502/503/504` status instead of a raw gateway error
- the page polls `/__maintenance_ready`
- once the app is healthy again, the page redirects back to the original URL automatically

If login works but refresh breaks:

- check `/etc/projex/projex.env`
- confirm `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` match the public origin
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
