# Projex

Project and grant budget tracking app.

Projex is a TanStack Start, React, TypeScript, BetterAuth, and Postgres app. The UI talks through the stable `ProjexApi` boundary, while server-backed behavior lives behind TanStack Start API routes and `src/server/fns/*`.

## Quick Start

```bash
pnpm install
pnpm run dev
```

Useful checks before handing work over or opening a PR:

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
```

Optional DB-backed integration coverage is included in `pnpm run test`, but is skipped unless an explicit integration database is provided. Use a migrated disposable database whose name contains `test`:

```bash
PROJEX_INTEGRATION_DATABASE_URL=postgres://.../projex_test pnpm run test
```

For a fully local disposable Postgres-backed integration run, use:

```bash
pnpm run test:integration:db
```

`pnpm run build` should not emit client chunk-size warnings. Current known build noise is limited to SSR dynamic/static import warnings from TanStack Start server route wiring.

## Local Server Utilities

```bash
# Apply BetterAuth + app SQL migrations to DATABASE_URL
pnpm run db:migrate

# Create a BetterAuth user
PROJEX_AUTH_EMAIL=... PROJEX_AUTH_PASSWORD=... PROJEX_AUTH_NAME=... pnpm run auth:create-user

# Bootstrap the first app-side global superadmin on a fresh database
PROJEX_AUTH_EMAIL=... PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" pnpm run auth:bootstrap-user

# Link an existing BetterAuth user into the app and grant global superadmin
PROJEX_AUTH_EMAIL=... PROJEX_APP_TEMPLATE_USER_ID=u_superadmin pnpm run auth:link-user

# Start the built server, including startup migrations
pnpm run start:server

# Smoke test a running server
pnpm run smoke:server
pnpm run smoke:server -- --section=emailChange

# Smoke test with disposable generated users/data, then clean them up
pnpm run smoke:server:generated

# Start a disposable Postgres instance, migrate it, build the app, run a local
# server against that isolated DB, then execute generated smoke end to end
pnpm run smoke:server:disposable

# Best-effort cleanup sweep for abandoned smoke_* fixtures
pnpm run smoke:cleanup
```

Notes:

- `pnpm run smoke:server:generated` still uses whatever `DATABASE_URL` the current server/runtime points at and creates disposable `smoke_*` rows in normal app tables.
- `pnpm run smoke:server:disposable` keeps Better Auth tables, app tables, and smoke fixture data inside a disposable local Postgres container instead.
- Both disposable commands accept `--keep-db` if you want to leave the container running for debugging.

## Product Model

- Companies own users, company defaults, projects, and programmes.
- Programmes are reporting-only containers. They can group one or more operational projects and show rollups for company admins, executives, and global superadmins.
- Projects are the operational workspace for budgets, imports, transactions, taxonomy, coding, splits, and transfers. Transaction transfer-out is disabled by default and can be enabled per project by company admins, executives, management, or an enabled global superadmin.
- Programme rollups are derived from active sub-project data; transactions and budgets are never duplicated onto the programme.
- Sub-projects must belong to the same company and use the same currency as their programme.
- PowerBI expenditure actuals are the primary import shape. Import Rules run before Auto-Categorise Rules so rows can be imported, excluded, or staged for project review before any category/subcategory coding is applied.
- Transaction actuals support signed amounts for credits, reversals, and recoveries. Budget allocations remain non-negative.

## Architecture Boundaries

- UI routes and components should depend on queries and the `ProjexApi` contract, not directly on storage.
- Client-safe API adapter code lives in `src/api/server/serverApi.ts`.
- Business logic belongs in `src/server/fns/*`.
- File routes under `src/routes/api.*.ts` should stay thin: parse input, call server functions, and return validated JSON.
- Request body validation belongs at the route boundary with Zod.
- Runtime ownership and authorization checks should be centralized through server guard helpers, not duplicated ad hoc inside route files.
- Do not import `src/server/*` from client modules.

## Server Runtime Notes

Production/staging server mode requires:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- one auth session resolution mode, preferably `BETTER_AUTH_DIRECT_SESSION_FN`
- `PROJEX_ENABLE_DEV_ENDPOINTS=false`

Recommended direct resolver:

```bash
BETTER_AUTH_DIRECT_SESSION_FN=./dist/server/auth/authProvider.js#getSessionFromRequest
```

Operational defaults:

- `pnpm run db:migrate` runs BetterAuth schema migration plus app SQL migrations.
- `pnpm-workspace.yaml` enforces a 7-day `minimumReleaseAge`, `minimumReleaseAgeStrict: true`, `trustPolicy: no-downgrade`, and `blockExoticSubdeps: true` to reduce exposure to newly published supply-chain attacks.
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` explicitly allowlists the origin.
- API responses include `x-request-id`; structured request logs are emitted server-side.
- Public deployments should use the nginx template at `deploy/nginx/projex.conf` for HTTPS redirects, security headers, forwarded headers, and the restart maintenance page.

## Documentation Map

Keep this list short. If a new note overlaps an existing item, update the existing source of truth instead of adding another markdown file.

- `docs/staging-runbook.md`: operational runbook, readiness checklist, deploy verification, first-admin bootstrap, and troubleshooting.
- `docs/database-migrations.md`: migration strategy, baseline rules, and runner expectations.
- `docs/deployment-ec2.md`: first-time EC2/RDS host provisioning only. Ongoing deploy operations belong in the runbook.
- `docs/email-ops-runbook.md`: email provider configuration, Resend checks, and email troubleshooting.
- `docs/permissions-matrix.md`: current company/project/comment permission model and superadmin rules.
- `docs/product-backlog.md`: product/admin backlog and non-priority ideas.
- `docs/verified-email-change-design.md`: design record for verified email-change behavior.
- `deploy/cdk/README.md`: AWS CDK stack notes.
