# Projex

Projex supports two intentional runtime modes:

- local development: seeded users + local data state
- server mode: TanStack Start routes, BetterAuth, and Postgres-backed runtime

The UI stays behind a stable `ProjexApi` boundary so local and server-backed flows can share the same pages/components.

## How it works

- **UI** uses TanStack Router for routes and TanStack Query for all data access.
- **API boundary**: the UI talks only to `src/api/contract.ts` (`ProjexApi`).
- **Local implementation**: `src/api/local/localApi.ts` stores state in localStorage using seed state (`src/seed`).
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
Staging/production should use real server auth, not seeded local login behavior.
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
- BetterAuth session resolution is wired through request-scoped server auth, with `BETTER_AUTH_DIRECT_SESSION_FN` as the preferred path.
- Dev-only session/reset endpoints are explicitly gated by `PROJEX_ENABLE_DEV_ENDPOINTS=true` and disabled in production.

Current app still supports local-first development while the server-backed route layer is active for deployed runtime.

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
