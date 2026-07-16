# Projex

[![CI](https://github.com/InsideOutInstitute/project-expense-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/InsideOutInstitute/project-expense-tracker/actions/workflows/ci.yml)

Project and grant budget tracking app.

Projex is a TanStack Start, React, TypeScript, Mantine 9, BetterAuth, and
Postgres app. The app uses explicit bridge layers so client-compilable code
reaches server behavior through shared endpoint contracts in `src/api/**` and
TanStack Start server functions in `src/server/start/functions/**`, while raw
HTTP routes stay transport-only and dynamically load server-only adapters from
`src/server/routes/**`.

## Quick Start

```bash
corepack enable
pnpm install
cp .env.local.example .env.local
pnpm run dev
```

Use Node `24` as pinned in `.nvmrc` and `.node-version`.

Useful checks before handing work over or opening a PR:

```bash
pnpm run test
pnpm run coverage
pnpm run db:verify-types
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
```

The repo now includes a GitHub Actions CI workflow at
`.github/workflows/ci.yml`. It currently runs four required lanes:

- an application verification lane for repo security verification,
  `pnpm audit --json`, `format:check`, `lint`, `typecheck`, Vitest
  app/runtime tests, and `build`
- a Postgres-backed lane for `db:migrate`, `db:verify-types`, and `test:integration:db`
- a disposable end-to-end lane for the full generated-fixture server smoke sweep
- a disposable browser smoke lane for the full browser-driven smoke flow

Normal repo flow is now branch -> pull request -> green required checks -> merge.
Direct pushes to protected `main` should be treated as an exception-only path.

For the most complete local reproduction of CI and deploy-artifact verification,
use:

```bash
pnpm run verify:ci
```

That pipeline-shaped command runs:

- repo security/config verification
- dependency audit
- Vite-aware unit and route-level tests
- typecheck and lint
- production build
- disposable Postgres-backed DB integration tests
- disposable Postgres-backed end-to-end smoke across every server smoke section
- disposable browser-driven smoke across the full supported browser smoke flow

Docker is required for `pnpm run verify:ci`, `pnpm run test:integration:db`,
`pnpm run smoke:server:disposable`, and
`pnpm run smoke:browser:disposable`. Playwright browser smoke also requires a
local Chromium install via `pnpm exec playwright install --with-deps chromium`
the first time you run it on a machine.

GitHub Actions CI and the deploy-artifact workflow now enforce the full
generated-fixture server smoke sweep plus the full supported browser smoke
flow, so local `verify:ci` and hosted gates stay aligned on what can merge and
ship. The supported EC2 deploy handoff is artifact-based and now uses SSM
instead of SSH for remote activation.

The manual deploy workflow expects GitHub Actions environment secrets for the
target environment. At minimum this means:

- AWS auth, preferably `AWS_DEPLOY_ROLE_ARN`, or the static-key fallback
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional
  `AWS_SESSION_TOKEN`
- `EC2_INSTANCE_ID`
- `EC2_DEPLOY_ARTIFACT_BUCKET`
- optional runtime path/health overrides such as `EC2_APP_ROOT`,
  `EC2_ENV_FILE`, `EC2_SERVICE_NAME`, `EC2_HEALTH_URL`, `EC2_READY_URL`, and
  `EC2_KEEP_RELEASES`

See [docs/staging-runbook.md](docs/staging-runbook.md) and
[docs/deployment-ec2.md](docs/deployment-ec2.md) for the full deploy setup.

For a reproducible local dependency stack with Postgres and MinIO, use [docs/local-services.md](docs/local-services.md).

Env example files are now split by purpose:

- `.env.example` for deploy-facing baseline values
- `.env.local.example` for normal local development
- `.env.smoke.example` for optional manual smoke credentials

Local-only UI toggles such as `VITE_ENABLE_DEVTOOLS` live in
`.env.local.example`.

## Verification

The short version:

- `pnpm run verify:security` for the fast non-Docker safety pass
- `pnpm run verify:ci` for the fuller local reproduction of CI plus deploy-artifact and CDK checks
- `pnpm run verify:smoke:full` for the full disposable server smoke sweep across every section
- `pnpm run verify:smoke:browser:full` for the full disposable browser smoke sweep
- `pnpm test` for the fast Vitest app/runtime lane
- `pnpm run coverage` for the Vitest-owned unit coverage gate and LCOV output
- `pnpm run test:integration:db` for targeted disposable Postgres-backed integration coverage
- `pnpm run smoke:server:disposable` for isolated local end-to-end smoke
- `pnpm run smoke:browser:disposable` for isolated browser-driven smoke
- `pnpm run smoke:server` and `PROJEX_VERIFY_BASE_URL=... pnpm run verify:deploy-security` for deployed-environment verification

For the full operational verification workflow, use [docs/staging-runbook.md](docs/staging-runbook.md).

For EC2 provisioning and bootstrap specifics, including the self-preparing CDK host baseline and the Let's Encrypt promotion step, use [docs/deployment-ec2.md](docs/deployment-ec2.md).

`pnpm test` now runs the Vite-owned app/runtime suite under Vitest. DB-backed integration remains a separate Node/disposable lane so route loading and `import.meta` behavior stay aligned with the actual app runtime. For the normal local workflow, prefer the automated disposable runner:

```bash
pnpm run test:integration:db
```

If you need to point the suite at an explicit integration database yourself, use a migrated disposable database whose name contains `test`:

```bash
PROJEX_INTEGRATION_DATABASE_URL=postgres://.../projex_test pnpm run test:integration:node
```

`pnpm run build` should not emit client chunk-size warnings. Current known
build noise is limited to SSR dynamic/static import warnings from TanStack
Start server route wiring around dynamic server-only adapters.

The request-scoped auth path now verifies the app user once at the request
boundary, caches that result in `src/server/http/requestContext.ts`, and passes
`sessionVerified` through server-function and route context so downstream code
does not need to duplicate session-user checks.

The current table layer is `mantine-react-table-open` on the Mantine 9 line.

## Local Commands

```bash
# Apply BetterAuth + app SQL migrations to DATABASE_URL
pnpm run db:migrate

# Generate the Kysely DB type surface from the current database schema
pnpm run db:generate-types

# Verify committed generated DB types still match the current database schema
pnpm run db:verify-types

# Create a BetterAuth user
PROJEX_AUTH_EMAIL=... PROJEX_AUTH_PASSWORD=... PROJEX_AUTH_NAME=... pnpm run auth:create-user

# Bootstrap the first app-side global superadmin on a fresh database
PROJEX_AUTH_EMAIL=... PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" pnpm run auth:bootstrap-user

# Link an existing BetterAuth user into the app and grant global superadmin
PROJEX_AUTH_EMAIL=... PROJEX_APP_TEMPLATE_USER_ID=u_superadmin pnpm run auth:link-user

# Start the built server
pnpm run start:server

# Package a prebuilt deploy artifact
pnpm run deploy:artifact:create

# Smoke test a running server
pnpm run smoke:server
pnpm run smoke:server -- --section=emailChange

# Smoke test with generated users/data against the current runtime DB
pnpm run smoke:server:generated

# Start a disposable Postgres instance, migrate it, build the app, run a local
# server against that isolated DB, then execute generated smoke end to end
pnpm run smoke:server:disposable

# The same full disposable server sweep, but through the verify namespace
pnpm run verify:smoke:full

# Re-run the full disposable server sweep without rebuilding first
pnpm run verify:smoke:full:skip-build

# The same disposable harness, but with a browser-driven smoke lane
pnpm run smoke:browser:disposable

# Best-effort cleanup sweep for abandoned smoke_* fixtures
pnpm run smoke:cleanup
```

In the admin Smoke dashboard, generated fixtures are now the default run mode.
Manual smoke remains available as an advanced mode for targeted checks against
existing accounts or long-lived data, with per-run inputs supplied in the UI
instead of relying on repo-local smoke env files.

Command semantics and deploy-time verification details live in [docs/staging-runbook.md](docs/staging-runbook.md) and [docs/database-migrations.md](docs/database-migrations.md).

## Product Model

- Companies own users, company defaults, projects, and programmes.
- Company standards currently include default taxonomy, import rules, and company auto-coding rules.
- Programmes are reporting-only containers. They can group one or more operational projects and show rollups for company admins, executives, and global superadmins.
- Projects are the operational workspace for budgets, imports, transactions, taxonomy, coding, splits, and transfers. Transaction transfer-out is disabled by default and can be enabled per project by company admins, executives, management, or an enabled global superadmin.
- New operational projects can start with company standards applied immediately, and synced projects can later reapply company standards to backfill missing categories plus resync inherited import and auto-coding rules.
- Synced projects may keep project-local exceptions, and company admins can promote stable project taxonomy, import rules, and auto-coding patterns back up into the company standard set.
- Programme rollups are derived from active sub-project data; transactions and budgets are never duplicated onto the programme.
- Sub-projects must belong to the same company and use the same currency as their programme.
- PowerBI expenditure actuals are the primary import shape. Import Rules run before Auto-Categorise Rules so rows can be imported, excluded, or staged for project review before any category/subcategory coding is applied.
- Repeated manual coding can trigger immediate project auto-coding suggestions, while company admins can also review repeated-pattern rule suggestions and accept them into company auto-coding defaults.
- Transaction actuals support signed amounts for credits, reversals, and recoveries. Budget allocations remain non-negative.

## Company Export

Projex now supports a production-ready full company Excel export. Remaining work is focused on BI/export contract hardening and workbook polish rather than basic workbook coverage.

### Current Functionality

- company-scope `.xlsx` export from Company Settings for admins, executives, and eligible global superadmins
- workbook options for active-only vs all visible projects/programmes, transaction date range filters, and full-detail vs summary workbook shape
- background export generation with job status polling and a reliable download handoff once the workbook is ready
- optional ready-email notification from Company Settings that links the user back to the exact export job once generation completes
- workbook payloads stored in S3-compatible object storage so export delivery and retention are decoupled from Postgres blob storage
- completed and failed export jobs are retained for 24 hours, and failed/background-stale cleanup also removes any stored object payloads
- server startup also recovers stale queued/running export jobs left behind by
  interrupted prior processes
- complete workbook coverage across the selected company, including workbook guidance, overview, executive summary, programmes, projects, programme membership, budgets, transactions, reviewed/locked/uncoded workflow tabs, taxonomy rollups, company default taxonomy, import rules, and memberships
- explicit row-level identifiers and relationship columns so exported data can be filtered, audited, reconciled, and reused outside Projex without losing context
- programme reporting exported as derived rollups only; operational transactions and budgets remain attached to the underlying projects so the workbook does not double count programme data
- stable workbook formatting suitable for finance handoff: frozen headers, consistent column naming, currencies preserved per row, generated-at metadata, and a hidden export-metadata contract sheet for downstream BI consumers

### Remaining Roadmap

- incremental downstream interoperability hardening as real BI/reporting consumers appear
- advanced workbook polish such as protected formula/report tabs, organization-specific cover sheets, and optional branded board-report style packs

## Architecture Boundaries

- Client-compilable code may cross into server behavior only through
  `src/api/**` contracts and `src/server/start/functions/**`.
- Shared business logic belongs in `src/server/fns/*`.
- TanStack Start request middleware lives in `src/server/start/*` and owns
  request-scoped session/context setup for server functions.
- Request-boundary session verification is centralized through
  `src/server/auth/currentSession.ts` and `src/server/http/requestContext.ts`.
  Server functions should trust `sessionVerified` from normalized context
  instead of re-implementing session-user validation ad hoc.
- File routes under `src/routes/api*.ts` stay transport-only: parse input, use
  `src/routes/-api-shared.ts`, and dynamically load `src/server/routes/**`
  adapters when raw HTTP endpoints need auth/env/db orchestration.
- Vite-owned tests run under Vitest so route/app module loading can rely on the
  Vite module graph instead of maintaining raw-Node loader fallbacks.
- Request body validation belongs at the route boundary with Zod.
- Runtime ownership and authorization checks should be centralized through
  server guard helpers, not duplicated ad hoc inside route files.
- Multi-project company-standards sync should prefer batched preloaded state
  helpers rather than per-project N+1 reads, following the taxonomy,
  import-rule, and auto-coding sync patterns now in `src/server/fns/**/sync.ts`.
- `tsconfig.app.json` intentionally stays on `types: ["vite/client"]` so app
  code cannot rely on Node globals leaking through mixed imports.

The detailed source of truth for these rules is
[docs/architecture-boundaries.md](docs/architecture-boundaries.md).

## Server Runtime Notes

Production/staging server mode requires:

- `DATABASE_URL`
- optional Postgres runtime tuning via `PG_POOL_MAX`,
  `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`, and `PG_SSL_MODE`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `PROJEX_ENABLE_DEV_ENDPOINTS=false`

Operational defaults:

- `pnpm run db:migrate` runs BetterAuth schema migration plus the squashed app baseline/future app migrations through Kysely's standard migrator.
- `pnpm run db:generate-types` regenerates `src/server/db/generated/db.d.ts` from the current database schema, while `pnpm run db:verify-types` is the drift check used in local verification.
- `pnpm run start:server` does not run migrations unless `PROJEX_RUN_MIGRATIONS=true` is set explicitly.
- `.github/workflows/deploy.yml` is the manual build-once deploy scaffold. It packages a prebuilt release artifact, uploads it to the deploy handoff S3 bucket, and can dispatch an SSM-based activation on EC2 without rebuilding on the instance.
- The enforced CSP intentionally retains `style-src-attr 'unsafe-inline'` for now because Mantine and current app UI still emit runtime `style=""` attributes; the rest of the policy stays nonce-based and strict.
- `pnpm-workspace.yaml` enforces a 7-day `minimumReleaseAge`, `minimumReleaseAgeStrict: true`, `trustPolicy: no-downgrade`, and `blockExoticSubdeps: true` to reduce exposure to newly published supply-chain attacks.
- `package.json` override rationale lives in [docs/dependency-overrides.md](docs/dependency-overrides.md).
- Cross-origin browser requests are denied unless `CORS_ALLOWED_ORIGINS` explicitly allowlists the origin.
- API responses include `x-request-id`; structured request logs are emitted server-side.
- Public deployments should use the nginx template at `deploy/nginx/projex.conf` for HTTPS redirects, security headers, forwarded headers, and the restart maintenance page.
- The Node SSR wrapper stays on the known-good `h3-v2` RC alias for now.
  `h3@2.0.0` is deprecated upstream, and swapping to the newer direct `h3`
  package line currently regresses the SSR login route in smoke verification.

## Documentation Map

Keep this list short. If a new note overlaps an existing item, update the existing source of truth instead of adding another markdown file.

- `docs/staging-runbook.md`: operational runbook, readiness checklist, deploy verification, first-admin bootstrap, and troubleshooting.
- `docs/database-migrations.md`: migration strategy, baseline rules, runner expectations, and generated Kysely DB typing workflow.
- `docs/architecture-boundaries.md`: allowed bridge modules, route adapter rules, and client/server import boundaries.
- `docs/deployment-ec2.md`: first-time EC2/RDS host provisioning only. Ongoing deploy operations belong in the runbook.
- `docs/email-ops-runbook.md`: email provider configuration, Resend checks, and email troubleshooting.
- `docs/permissions-matrix.md`: current company/project/comment permission model and superadmin rules.
- `docs/product-backlog.md`: product/admin backlog and non-priority ideas.
- `docs/rule-suggestions-design.md`: design for deriving company rule suggestions from repeated manual coding.
- `docs/verified-email-change-design.md`: design record for verified email-change behavior.
- `CONTRIBUTING.md`: local setup, verification expectations, and contribution workflow.
- `SECURITY.md`: vulnerability reporting path and deployment security expectations.
- `deploy/cdk/README.md`: AWS CDK stack notes.
