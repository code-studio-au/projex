# Server Readiness Checklist

This checklist is for the TanStack Start + EC2 + RDS cutover path.

## 1) Environment

- `DATABASE_URL` points to the target RDS Postgres instance.
- `NODE_ENV=production` in deployed runtime.
- `BETTER_AUTH_SESSION_URL` is configured to your BetterAuth server/session endpoint.
- Or `BETTER_AUTH_DIRECT_SESSION_FN` is configured for direct BetterAuth SDK/session resolver module.
- At least one auth mode must be configured in production.
- `PROJEX_ENABLE_DEV_ENDPOINTS` is **unset** (or not `true`) in production/staging.
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

- BetterAuth endpoint returns a session payload compatible with:
  - `{ userId: string }` or
  - `{ user: { id: string } }`
- App server forwards request cookies to `BETTER_AUTH_SESSION_URL`.
- Unauthorized requests return `401` and do not leak data.
- BetterAuth user IDs are linked to app `users.id` and memberships (e.g. via `npm run auth:link-user`).

## 4) Authorization & Scope

- Superadmin can view all companies except bootstrap shell company where applicable.
- Non-superadmin reads are scoped to company memberships.
- Project, membership, taxonomy, budget, and transaction writes enforce role checks server-side.
- Archived/deactivated project/company behavior matches local parity rules.

## 5) Dev-only Endpoints

Dev endpoints exist for local/server-mode workflows only:

- `POST /api/dev/session` (`loginAs`)
- `POST /api/dev/reset-seed` (`resetToSeed`)

They are enabled only when:

- `PROJEX_ENABLE_DEV_ENDPOINTS=true`
- and `NODE_ENV !== production`

## 6) Verification Before Deploy

- `npm run lint`
- `npm run typecheck`
- `npm run test:contracts`
- `npm run build`
- `npm run smoke:server` (against a running server with dev endpoints enabled in non-prod)
  - For real auth flow set `PROJEX_SMOKE_EMAIL` + `PROJEX_SMOKE_PASSWORD`.
- `npm run start:server` (bootstrap migrations + launch built server)

## 6.1) Runtime Probes

- `/api/health` should return `200` when process is running.
- `/api/ready` should return `200` only when env + DB checks pass.

## 7) Cutover Notes

- Keep local mode available temporarily for rollback confidence.
- Run smoke checks after deploy:
  - login/logout
  - company directory scoping
  - project open by role
  - transaction create/update/import/delete
  - taxonomy and budget CRUD
