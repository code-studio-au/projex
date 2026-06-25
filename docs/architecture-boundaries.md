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

## Client-app rule

Files outside `src/server/**` must not import server infrastructure directly.
App code may cross into server behavior only through:

- `src/api/**`
- `src/server/start/functions/**`

This keeps `tsconfig.app.json` viable without Node globals and prevents auth/env
implementation details from leaking into the app compilation graph.

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
