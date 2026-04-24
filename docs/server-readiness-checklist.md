# Server Readiness Checklist

This checklist is for the TanStack Start + EC2 + RDS cutover path.

Status:

- This is still useful as a deploy/readiness checklist.
- Current preferred auth path is `BETTER_AUTH_DIRECT_SESSION_FN`.
- `BETTER_AUTH_SESSION_URL` remains a supported fallback, not the default recommendation.

## 1) Environment

- `DATABASE_URL` points to the target RDS Postgres instance.
- `NODE_ENV=production` in deployed runtime.
- `NODE_ENV=production` is supplied by deployed runtime env or systemd, not by repo `.env.production` / `.env.staging` files used by Vite.
- `BETTER_AUTH_SECRET` is configured.
- `BETTER_AUTH_URL` is configured to the canonical public app origin.
- `BETTER_AUTH_DIRECT_SESSION_FN` is configured for direct BetterAuth SDK/session resolver module.
- Or `BETTER_AUTH_SESSION_URL` is configured as a fallback BetterAuth session endpoint.
- At least one auth mode must be configured in production.
- `PROJEX_ENABLE_DEV_ENDPOINTS` is `false` (or at minimum not `true`) in production/staging.
- Startup validator (`src/server/env.ts`) will fail fast in production if required vars are missing.
- `CORS_ALLOWED_ORIGINS` configured for explicit browser cross-origin allowlist.
  Cross-origin requests are denied by default unless listed.

## 2) Database

- Run migrations before app startup:
  - `npm run db:migrate`
  - Includes BetterAuth table migration + app SQL migrations.
- Confirm schema includes:
  - `companies.deactivated_at`
  - `projects.deactivated_at`
  - `txns.id` internal BIGINT identity
  - `txns.public_id` external/public transaction ID
  - `txns.external_id` import dedupe/reference ID

## 3) Auth

- BetterAuth direct resolver or endpoint returns a session payload compatible with:
  - `{ userId: string }` or
  - `{ user: { id: string } }`
- App server resolves auth from the incoming request, preferably through `BETTER_AUTH_DIRECT_SESSION_FN`.
- If `BETTER_AUTH_SESSION_URL` is used, app server forwards request cookies to that endpoint.
- Unauthorized requests return `401` and do not leak data.
- BetterAuth user IDs are linked to app `users.id` and memberships (e.g. via `npm run auth:bootstrap-user` or `npm run auth:link-user`).
- Header-based auth impersonation must not be enabled on public traffic.

## 4) Authorization & Scope

- Superadmin can view all companies except bootstrap shell company where applicable.
- Non-superadmin reads are scoped to company memberships.
- Project, membership, taxonomy, budget, and transaction writes enforce role checks server-side.
- Archived/deactivated project/company behavior matches local parity rules.

## 5) Dev-only Endpoints

Dev endpoints exist for local or controlled non-production workflows only:

- `POST /api/dev/session`

They are enabled only when:

- `PROJEX_ENABLE_DEV_ENDPOINTS=true`
- and `NODE_ENV !== production`

## 6) Verification Before Deploy

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run smoke:server` (against a running server with dev endpoints enabled in non-prod)
  - For real auth flow set `PROJEX_SMOKE_EMAIL` + `PROJEX_SMOKE_PASSWORD`.
  - To avoid retyping smoke credentials, save them in `.env.smoke.local` at the repo root.
  - To rerun only one area, use `npm run smoke:server -- --section=<name>`.
- `npm run start:server` (bootstrap migrations + launch built server)

## 6.1) Runtime Probes

- `/api/health` should return `200` when process is running.
- `/api/ready` should return `200` only when env + DB checks pass.
- `/api/ready` should not expose detailed dependency state publicly; use status code for probes.

## 6.2) Browser Hardening

- Public HTTPS traffic is fronted by nginx (or equivalent edge proxy).
- HTTP redirects cleanly to HTTPS.
- `server_tokens off` is enabled in nginx.
- Site-wide responses include:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options` or CSP `frame-ancestors`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy`
- Use `deploy/nginx/projex.conf` as the baseline config and adjust CSP only as needed for new external assets.

## 6.3) Maintenance Fallback

- nginx is configured to intercept upstream `502`, `503`, and `504` responses for normal app routes.
- nginx serves `deploy/nginx/maintenance.html` instead of exposing raw upstream errors during restart windows.
- the static page polls `GET /__maintenance_ready`.
- `__maintenance_ready` proxies to `/api/ready` with `proxy_intercept_errors off` so the browser can distinguish:
  - app still unavailable
  - app healthy again
- when the readiness probe returns `200`, the maintenance page redirects back to the original URL automatically.

## 7) Cutover Notes

- Keep development-only auth helpers disabled outside controlled local workflows.
- Do not deploy staging with development-only auth semantics.
- Run smoke checks after deploy:
  - login/logout
  - company directory scoping
  - project open by role
  - transaction create/update/import/delete
  - taxonomy and budget CRUD
