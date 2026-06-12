# Projex

Project and grant budget tracking app.

Projex is a TanStack Start, React, TypeScript, Mantine 9, BetterAuth, and Postgres app. The UI uses TanStack Start server functions for app internals, while route-backed HTTP endpoints stay thin over `src/server/fns/*`.

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

For the most complete local or future-CI verification pass, use:

```bash
pnpm run verify:ci
```

That pipeline-shaped command runs:

- repo security/config verification
- dependency audit
- unit and route-level tests
- typecheck and lint
- production build
- disposable Postgres-backed DB integration tests
- disposable Postgres-backed end-to-end smoke for the `basics` section

Docker is required for `pnpm run verify:ci`, `pnpm run test:integration:db`, and `pnpm run smoke:server:disposable`.

## Verification

The short version:

- `pnpm run verify:security` for the fast non-Docker safety pass
- `pnpm run verify:ci` for the fuller local or future-CI gate
- `pnpm run test:integration:db` for targeted disposable Postgres-backed integration coverage
- `pnpm run smoke:server:disposable` for isolated local end-to-end smoke
- `pnpm run smoke:server` and `PROJEX_VERIFY_BASE_URL=... pnpm run verify:deploy-security` for deployed-environment verification

For the full operational verification workflow, use [docs/staging-runbook.md](/Users/scas0196/Documents/code/projex/docs/staging-runbook.md:1).

`pnpm run test` still includes optional DB-backed integration coverage, but those tests are skipped unless `PROJEX_INTEGRATION_DATABASE_URL` is set. For the normal local workflow, prefer the automated disposable runner:

```bash
pnpm run test:integration:db
```

If you need to point the suite at an explicit integration database yourself, use a migrated disposable database whose name contains `test`:

```bash
PROJEX_INTEGRATION_DATABASE_URL=postgres://.../projex_test pnpm run test
```

`pnpm run build` should not emit client chunk-size warnings. Current known build noise is limited to SSR dynamic/static import warnings from TanStack Start server route wiring.

The current table layer is `mantine-react-table-open` on the Mantine 9 line.

## Local Commands

```bash
# Apply BetterAuth + app SQL migrations to DATABASE_URL
pnpm run db:migrate

# Create a BetterAuth user
PROJEX_AUTH_EMAIL=... PROJEX_AUTH_PASSWORD=... PROJEX_AUTH_NAME=... pnpm run auth:create-user

# Bootstrap the first app-side global superadmin on a fresh database
PROJEX_AUTH_EMAIL=... PROJEX_BOOTSTRAP_COMPANY_NAME="Demo Company" PROJEX_BOOTSTRAP_PROJECT_NAME="Demo Project" pnpm run auth:bootstrap-user

# Link an existing BetterAuth user into the app and grant global superadmin
PROJEX_AUTH_EMAIL=... PROJEX_APP_TEMPLATE_USER_ID=u_superadmin pnpm run auth:link-user

# Start the built server
pnpm run start:server

# Smoke test a running server
pnpm run smoke:server
pnpm run smoke:server -- --section=emailChange

# Smoke test with generated users/data against the current runtime DB
pnpm run smoke:server:generated

# Start a disposable Postgres instance, migrate it, build the app, run a local
# server against that isolated DB, then execute generated smoke end to end
pnpm run smoke:server:disposable

# Best-effort cleanup sweep for abandoned smoke_* fixtures
pnpm run smoke:cleanup
```

Command semantics and deploy-time verification details live in [docs/staging-runbook.md](/Users/scas0196/Documents/code/projex/docs/staging-runbook.md:1) and [docs/database-migrations.md](/Users/scas0196/Documents/code/projex/docs/database-migrations.md:1).

## Product Model

- Companies own users, company defaults, projects, and programmes.
- Programmes are reporting-only containers. They can group one or more operational projects and show rollups for company admins, executives, and global superadmins.
- Projects are the operational workspace for budgets, imports, transactions, taxonomy, coding, splits, and transfers. Transaction transfer-out is disabled by default and can be enabled per project by company admins, executives, management, or an enabled global superadmin.
- Programme rollups are derived from active sub-project data; transactions and budgets are never duplicated onto the programme.
- Sub-projects must belong to the same company and use the same currency as their programme.
- PowerBI expenditure actuals are the primary import shape. Import Rules run before Auto-Categorise Rules so rows can be imported, excluded, or staged for project review before any category/subcategory coding is applied.
- Transaction actuals support signed amounts for credits, reversals, and recoveries. Budget allocations remain non-negative.

## Company Export Roadmap

Projex now supports a production-ready full company Excel export, with the remaining roadmap focused on automation, governance, and downstream interoperability rather than basic workbook coverage.

### Current Functionality

- company-scope `.xlsx` export from Company Settings for admins, executives, and eligible global superadmins
- workbook options for active-only vs all visible projects/programmes, transaction date range filters, and full-detail vs summary workbook shape
- background export generation with job status polling and a reliable download handoff once the workbook is ready
- complete workbook coverage across the selected company, including workbook guidance, overview, executive summary, programmes, projects, programme membership, budgets, transactions, reviewed/locked/uncoded workflow tabs, taxonomy rollups, company default taxonomy, import rules, and memberships
- explicit row-level identifiers and relationship columns so exported data can be filtered, audited, reconciled, and reused outside Projex without losing context
- programme reporting exported as derived rollups only; operational transactions and budgets remain attached to the underlying projects so the workbook does not double count programme data
- stable workbook formatting suitable for finance handoff: frozen headers, consistent column naming, currencies preserved per row, and generated-at metadata

### Remaining Roadmap

- scheduled and automated delivery, including recurring exports for finance, executive, and audit audiences
- governance-grade history such as export audit logs, who generated which workbook, scope used, and when it was delivered
- stronger downstream interoperability such as template-safe imports into BI/reporting pipelines and versioned export contracts for external consumers
- advanced workbook polish including protected formula/report tabs, organization-specific cover sheets, and optional branded board-report style packs

## Architecture Boundaries

- UI routes and components should depend on queries and TanStack Start server functions, not directly on storage.
- Shared business logic belongs in `src/server/fns/*`.
- TanStack Start request middleware lives in `src/server/start/*` and should own request-scoped session/context setup.
- File routes under `src/routes/api.*.ts` should stay thin: parse input, call server functions, and return validated JSON.
- Request body validation belongs at the route boundary with Zod.
- Runtime ownership and authorization checks should be centralized through server guard helpers, not duplicated ad hoc inside route files.
- Do not import `src/server/*` from client modules.

## Server Runtime Notes

Production/staging server mode requires:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `PROJEX_ENABLE_DEV_ENDPOINTS=false`

Operational defaults:

- `pnpm run db:migrate` runs BetterAuth schema migration plus the squashed app baseline/future app migrations through Kysely's standard migrator.
- `pnpm run start:server` does not run migrations unless `PROJEX_RUN_MIGRATIONS=true` is set explicitly.
- The enforced CSP intentionally retains `style-src-attr 'unsafe-inline'` for now because Mantine and current app UI still emit runtime `style=""` attributes; the rest of the policy stays nonce-based and strict.
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
