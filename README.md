# Projex (local-first, TanStack-ready)

This build runs fully **local** (localStorage + seed data) but is structured so you can later swap to a TanStack Start + Query + Router backend with minimal UI churn.

## How it works

- **UI** uses TanStack Router for routes and TanStack Query for all data access.
- **API boundary**: the UI talks only to `src/api/contract.ts` (`ProjexApi`).
- **Current implementation**: `src/api/local/localApi.ts` stores state in localStorage using your existing seed state (`src/seed`).
- **Later implementation**: replace `api` in `src/api/index.ts` with a server-backed adapter that calls TanStack Start server functions.

## Dev

```bash
npm install
npm run dev
```

## Server transition utilities

```bash
# Apply BetterAuth + app SQL migrations to DATABASE_URL
npm run db:migrate

# Reset app-domain tables to full baseline seed data
npm run db:seed:baseline

# Create BetterAuth user (email/password)
PROJEX_AUTH_EMAIL=... PROJEX_AUTH_PASSWORD=... PROJEX_AUTH_NAME=... npm run auth:create-user

# Link BetterAuth user to app users/memberships (copy roles from template user if set)
PROJEX_AUTH_EMAIL=... PROJEX_APP_TEMPLATE_USER_ID=u_superadmin npm run auth:link-user

# Run adapter contract checks (LocalApi + ServerApi stubs)
npm run test:contracts

# Start server build with migrations
npm run start:server

# Smoke test a running server
npm run smoke:server
```

- Transition map: `docs/server-transition-map.md`
- DB migrations: `src/server/db/migrations`
- Start integration wiring: `docs/start-route-integration.md`
- Server readiness checklist: `docs/server-readiness-checklist.md`
- EC2 deployment guide: `docs/deployment-ec2.md`
- Staging runbook: `docs/staging-runbook.md`

## Auth modes (server)

Use one of:

- `BETTER_AUTH_SESSION_URL` (session endpoint integration), or
- `BETTER_AUTH_DIRECT_SESSION_FN` (`modulePath#exportName` direct resolver hook).

In production, startup validation requires `DATABASE_URL` plus one auth mode.
Starter direct resolver file: `src/server/auth/authProvider.ts`.
If using direct resolver with local BetterAuth instance, also set:
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated, optional)

TanStack Start BetterAuth handler route is mounted at `/api/auth/$`.
Session query/logout in `VITE_API_MODE=server` prefer BetterAuth client methods (`getSession`/`signOut`) with adapter fallback.
`npm run db:migrate` now runs BetterAuth schema migration + app SQL migrations.

## Security defaults

- `PROJEX_ENABLE_DEV_ENDPOINTS` must not be `true` in production.
- Cross-origin browser requests are denied by default.
- `CORS_ALLOWED_ORIGINS` (comma-separated) enables explicit cross-origin allowlisting.
- All API responses include `x-request-id` and structured request logs are emitted server-side.

## TanStack Start migration status

- Start runtime deps are added (`@tanstack/react-start`).
- Vite is wired with `tanstackStart()` and `vite-tsconfig-paths`.
- File-based API routes live under `src/routes/api.*.ts`.
- Server function implementations live under `src/server/fns/*`.
- Request-scoped adapter wiring lives under `src/server/api/*`.
- BetterAuth-compatible session resolution is wired via `BETTER_AUTH_SESSION_URL`.
- Dev-only session/reset endpoints are explicitly gated by `PROJEX_ENABLE_DEV_ENDPOINTS=true` and disabled in production.

Current app still runs with the existing client bootstrap while Start route files are
migrated incrementally.

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
