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
  returns them as response headers, and logs private unexpected-error causes
  before the generic `AppError` crosses the RPC boundary.

Do not re-implement session-user lookups inside feature modules when normalized
context is already available.

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

## Transaction workflow rule

Keep transaction and reversal responsibilities behind the existing transaction
server-function boundary, but separate their domain implementation:

- `reversalMatching.ts` owns pure candidate compatibility and pairing.
- `reversalReconciliation.ts` owns candidate discovery and suggestion
  persistence.
- `reversalDomain.ts` owns workflow invariants and persisted-row lookup.
- `reversalComments.ts` owns audit-comment construction and persistence.
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

## Feature UI rule

Rendering components should delegate reusable mutation orchestration to feature
controllers or scope adapters. The transaction bulk-action controller is the
reference for loading state, result notifications, and selection cleanup. The
shared import-rule editor is the reference for one editor receiving thin
company/project data adapters while pure option, dirty-state, and ordering
decisions remain independently testable.
