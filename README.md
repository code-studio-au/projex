# Projex

Projex supports two intentional runtime modes:

- local development: server-backed runtime with optional dev-only bootstrap helpers
- server mode: TanStack Start routes, BetterAuth, and Postgres-backed runtime

The UI stays behind a stable `ProjexApi` boundary so local and server-backed flows can share the same pages/components.

## How it works

- **UI** uses TanStack Router for routes and TanStack Query for all data access.
- **API boundary**: the UI talks only to `src/api/contract.ts` (`ProjexApi`).
- **Server implementation**: `src/api/server/serverApi.ts` talks to TanStack Start file routes under `src/routes/api.*.ts`.

## Dev

```bash
npm install
npm run dev
```

## Server transition utilities

```bash
# Apply BetterAuth + app SQL migrations to DATABASE_URL
npm run db:migrate

# Create BetterAuth user (email/password)
PROJEX_AUTH_EMAIL=... PROJEX_AUTH_PASSWORD=... PROJEX_AUTH_NAME=... npm run auth:create-user

# Bootstrap a real app user with a company/project in server mode
PROJEX_AUTH_EMAIL=... PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" npm run auth:bootstrap-user

# Or link BetterAuth user to app users/memberships (copy roles from template user if set)
PROJEX_AUTH_EMAIL=... PROJEX_APP_TEMPLATE_USER_ID=u_superadmin npm run auth:link-user

# Start server build with migrations
npm run start:server

# Smoke test a running server
npm run smoke:server

# Run only one smoke section
npm run smoke:server -- --section=emailChange
```

- DB migrations: `src/server/db/migrations`
- Start integration wiring: `docs/start-route-integration.md`
- Server readiness checklist: `docs/server-readiness-checklist.md`
- EC2 deployment guide: `docs/deployment-ec2.md`
- Production runbook: `docs/staging-runbook.md`
- Email ops runbook: `docs/email-ops-runbook.md`
- Verified email-change design: `docs/verified-email-change-design.md`
- Product backlog: `docs/product-backlog.md`

## Auth modes (server)

Use one of:

- `BETTER_AUTH_DIRECT_SESSION_FN` (`modulePath#exportName` direct resolver hook), or
- `BETTER_AUTH_SESSION_URL` (session endpoint fallback).

Recommended server setup:

- `VITE_API_MODE=server`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_DIRECT_SESSION_FN`

In production, startup validation requires:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- one auth session resolution mode

Starter direct resolver file: `src/server/auth/authProvider.ts`.
If using direct resolver with local BetterAuth instance, also set:
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated, optional)

TanStack Start BetterAuth handler route is mounted at `/api/auth/$`.
Staging/production should use real server auth only.
`npm run db:migrate` now runs BetterAuth schema migration + app SQL migrations.

## Security defaults

- `PROJEX_ENABLE_DEV_ENDPOINTS` must not be `true` in production.
- Cross-origin browser requests are denied by default.
- `CORS_ALLOWED_ORIGINS` (comma-separated) enables explicit cross-origin allowlisting.
- All API responses include `x-request-id` and structured request logs are emitted server-side.
- API and auth responses include baseline hardening headers:
  - `Strict-Transport-Security` (when served over HTTPS)
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- The readiness endpoint intentionally returns only minimal status data in production responses.
- For full site-wide browser hardening on HTML responses, use the nginx template at `deploy/nginx/projex.conf`.

## TanStack Start migration status

- Start runtime deps are added (`@tanstack/react-start`).
- Vite is wired with `tanstackStart()` and `vite-tsconfig-paths`.
- File-based API routes live under `src/routes/api.*.ts`.
- Server function implementations live under `src/server/fns/*`.
- Request-scoped adapter wiring lives under `src/server/api/*`.
- BetterAuth session resolution is wired through request-scoped server auth, with `BETTER_AUTH_DIRECT_SESSION_FN` as the preferred path.
- Dev-only session/reset endpoints are explicitly gated by `PROJEX_ENABLE_DEV_ENDPOINTS=true` and disabled in production.

Current app is optimized around the server-backed route layer for both deployed runtime and local server-mode development.

## API contract notes

Normal app-facing API routes should follow the shared contract:

- validate request bodies with Zod at the route boundary
- return JSON shapes that are validated in `src/api/server/serverApi.ts`
- keep business logic in `src/server/fns/*`, not in the route file

There are a few intentional exceptions:

1. `/api/auth/$`
   - Better Auth passthrough route
   - protocol-owned, not app-owned

2. `/api/admin/smoke`
   - NDJSON streaming route for superadmin smoke runs

3. `/api/health` and `/api/ready`
   - operational probe endpoints for deploy / restart / maintenance behavior

4. `/api/dev/*`
   - local/development-only helper endpoints

If a new endpoint does not fit one of those categories, treat it like a normal app API route and keep it inside the shared validation/adapter pattern.

## Where to swap backend later

1. Keep `ProjexApi` stable (`src/api/contract.ts`).
2. Add a `ServerApi` implementation that calls TanStack Start server functions.
3. Change `src/api/index.ts` to export the new adapter.

All your page/components should keep working because they depend on **queries**, not on any concrete storage mechanism.

Project & grant budget tracking app.

## Tech

- Vite
- React
- TypeScript

## Development

```bash
npm install
npm run dev
```
