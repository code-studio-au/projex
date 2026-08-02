# Architecture Boundaries

The repo uses explicit bridge modules so app-compilable code does not drift into
server-only auth, env, db, mail, storage, or runtime internals.

## Allowed bridges

- `src/api/**`
  Shared request/response contracts, validation-facing types, and typed dynamic
  loader helpers.
- `src/server/start/functions/**`
  TanStack Start server functions that app routes, pages, and components may
  call from client-compilable code.
- `src/routes/-api-shared.ts`
  Transport helpers for HTTP API routes.
- `src/server/routes/**`
  Server-only route adapters that API route files may load dynamically.

## Request context rule

Session verification should happen once per request and then flow through the
normalized server context:

- `src/server/auth/currentSession.ts` owns BetterAuth session lookup plus app
  user verification.
- `src/server/http/requestContext.ts` caches that verified result per request.
- `src/server/fns/runtime.ts` trusts `sessionVerified` when request context has
  already normalized the session.
- `src/server/start/middleware.ts` assigns native server-function request IDs,
  returns them as response headers, and classifies unexpected errors through
  the sanitized structured logging boundary before the generic `AppError`
  crosses the RPC boundary.

Do not re-implement session-user lookups inside feature modules when normalized
context is already available.

## Server logging rule

Production application code must use `src/api/serverLogging.ts` rather than
calling console methods directly. Only stable event names, approved scalar
metadata, and safe error classifications may reach structured logs. Never pass
raw exception messages, stacks, headers, cookies, credentials, connection
URLs, provider bodies, email content, reset links, or imported financial text.

Migration, bootstrap-user, and smoke CLI entrypoints retain deliberate terminal
output and are enforced as the only direct-console exceptions.

## Client-app rule

Files outside `src/server/**` must not import server infrastructure directly.
App code may cross into server behavior only through:

- `src/api/**`
- `src/server/start/functions/**`

This keeps `tsconfig.app.json` viable without Node globals and prevents auth/env
implementation details from leaking into the app compilation graph.

## Transport policy

- Use HTTP route handlers for browser-visible transport concerns such as query
  params, cache-friendly paginated reads, file download/upload flows, and any
  endpoint that benefits from explicit method/status/header behavior.
- Use `createServerFn` for command-style mutations and lightweight reads that
  are naturally RPC-shaped inside the app graph.
- If a feature uses both, document why. The transactions page is the reference
  pattern: paginated listing stays on the HTTP route transport, while mutations
  and focused server actions use `createServerFn`.

## Test runtime rule

Vite-owned tests should run under Vitest, not raw `node:test`. That includes
modules that depend on `import.meta.env`, `import.meta.glob`, TanStack Start
route wiring, or Vite-transformed lazy loading.

Keep plain Node runners for operational or integration checks that intentionally
exercise script entrypoints, real database orchestration, or disposable-runtime
behavior outside the Vite module graph.

## API route rule

`src/routes/api*.ts` files should stay transport-only. They may:

- validate params/body
- call helpers from `src/routes/-api-shared.ts`
- dynamically load `src/server/routes/**` adapters

They should not compose auth/env/db/storage modules inline.

## Server adapter rule

`src/server/routes/**` is the place for route-specific orchestration that needs
server infrastructure, especially auth/session, env checks, db probes, and
server-only cookies.

## Batched sync rule

When company standards must sync across many projects, prefer a shared
preloaded-state helper plus grouped reads over per-project N+1 queries.

Current reference patterns:

- `src/server/fns/importRules/sync.ts`
- `src/server/fns/projectAutoCodingRules/sync.ts`
- `src/server/fns/taxonomy/standards.ts`

## Rule suggestion rule

Manual-coding signals use `(project_id, txn_public_id)` as their transaction
identity. Company aggregates contain company-standard target IDs and bounded
evidence only; they must not depend on one project's taxonomy rows.

Keep signal writes in `ruleSuggestions.ts`, aggregate refresh in
`ruleSuggestions/aggregation.ts`, reads in `ruleSuggestions/readServers.ts`,
and review mutations in `ruleSuggestions/reviewServers.ts`. Aggregate refresh
must take the company pattern advisory lock before reading and writing so
concurrent coding cannot create competing suggestions.

## Transaction workflow rule

Keep transaction and reversal responsibilities behind the existing transaction
server-function boundary, but separate their domain implementation:

- `reversalMatching.ts` owns pure candidate compatibility and pairing.
- `reversalMatchFacts.ts` owns provider-neutral canonical match facts,
  immutable pair snapshots, and review evidence.
- `reversalReconciliation.ts` owns candidate discovery and suggestion
  persistence.
- `reversalDomain.ts` owns workflow invariants and persisted-row lookup.
- `reversalComments.ts` owns human reversal notes and their workflow lifecycle;
  transaction status belongs to the reversal record and immutable history
  belongs to `reversalAudit.ts`.
- `reversalAudit.ts` owns immutable reversal transition audit records.
- `reversalWorkflowServers.ts` owns individual workflow transitions.
- `reversalBulkServers.ts` owns project recovery and atomic bulk approval.
- `bulkWorkflowServers.ts` owns non-reversal bulk transaction commands.
- `reversalServers.ts` remains a compatibility facade, not an implementation
  module.

Bulk commands must make eligibility decisions after entering their database
transaction. Lock selected rows in deterministic order, repeat eligibility in
the write predicate, and verify affected-row counts. Transaction lock changes
and reversal transitions also take the shared project-scoped advisory lock so
neither workflow can invalidate the other's decision mid-command.
Single and bulk lock commands use the same SQL eligibility expression, and a
database trigger rejects uncoded, approval-pending, or reversal-pending locks
from alternate write paths.
Database constraints independently enforce pair ownership, sign, amount, date
order, and linked transaction identity so alternate write paths cannot bypass
the server-function boundary.

## Financial integrity rule

Import preview candidates, category targets, and structural transaction lineage
are server-owned relational state. Browser code may submit decisions, never a
reconstructed financial transaction. Subcategory identity owns category
identity, and split or transfer relationships must be represented by balanced
`txn_links` created in the same transaction as their rows. See
the [transaction integrity contract](transaction-integrity.md) for the
persisted rules.

Preview row decisions use the persisted source-row index, not a future
transaction ID. Project-scoped operational tables use composite
`(company_id, project_id)` foreign keys as defense-in-depth against cross-tenant
references.

## Audit and workflow rule

Protected financial and administrative mutations must use
`recordAuditLogEvent` inside `withAuditLoggingTransaction`, normally through
`executeAuditedTransaction`. The wrapper buffers reviewed scalar identifiers and
emits them through the central structured logger only after the database
transaction commits. Rolled-back operations emit nothing. Audit telemetry is
best-effort operational output, not a durable product audit trail; domain state
and user-entered reasons must remain in their authoritative relational records.
Never add raw request bodies, comments, email addresses, imported financial
text, or state snapshots to log fields.

`PROJEX_AUDIT_LOGGING` independently enables audit-category output and
`PROJEX_LOG_LEVEL` controls operational output. Both paths write sanitized JSON
to stdout/stderr for journald collection. They must not write logs to the
application database or call a vendor SDK directly.

Transaction workflow commands must lock the row and compare
`workflow_version` before changing review or lock state. Unlock requests are
separate workflow records and must be resolved through their authorized command
boundary; never update a locked transaction directly to simulate approval.

## Route state rule

Route search schemas should recover valid fields independently when one query
parameter is malformed. Interactive transaction search keeps an immediate local
draft and commits a single delayed route update through
`useTransactionSearch.ts`; table libraries must not add a second debounce or
take ownership of the input value.

## Inheritance reconciliation rule

Categories, subcategories, import rules, and project auto-coding rules must use
the pure transition planner in `src/server/sync/projectStandards.ts`. Persistence
adapters remain entity-specific, but they must share the local, inherited,
overridden, and detached lifecycle, adopt exact local duplicates, preserve
overrides, and detach missing sources. Company propagation must remain
transactional and emit an inheritance audit log after commit when enabled.

## Feature UI rule

Rendering components should delegate reusable mutation orchestration to feature
controllers or scope adapters. The transaction bulk-action controller is the
reference for loading state, result notifications, and selection cleanup. The
shared import-rule editor is the reference for one editor receiving thin
company/project data adapters while pure option, dirty-state, and ordering
decisions remain independently testable.
