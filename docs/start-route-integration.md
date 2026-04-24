# TanStack Start Route Integration

This repo already uses a TanStack Start route + bridge layer for server-backed API calls.

Status:

- Keep this doc as a boundary/reference note.
- It is no longer just planning material; much of this wiring is active.

## Server modules already prepared

- `src/server/api/startBridge.ts`
- `src/server/api/startServerApi.ts`
- `src/routes/-api-shared.ts`

## Current route mapping

Representative file routes:

- `src/routes/api.companies.ts`
- `src/routes/api.companies.$companyId.projects.ts`
- `src/routes/api.projects.$projectId.ts`
- `src/routes/api.projects.$projectId.transactions.ts`
- `src/routes/api.projects.$projectId.transactions.import.ts`
- `src/routes/api.projects.$projectId.transactions.$txnId.ts`

Additional domains are also already routed through `src/routes/api.*.ts`.

## Route shape

Each file route uses `server.handlers` and calls `withApi(request, run)` in
`src/routes/-api-shared.ts`.

## Important boundary rule

Do not import `src/server/*` from client modules.

- Keep client adapter: `src/api/server/serverApi.ts` client-safe.
- Keep DB/auth imports in `src/server/*` only.

## Current guidance

1. Keep `src/api/server/serverApi.ts` as the client-safe browser/SSR adapter.
2. Keep request-scoped auth/session resolution in the Start bridge layer.
3. Add new server-backed capabilities by extending `src/routes/api.*.ts` plus `src/server/fns/*`.
4. Do not reintroduce environment-specific shortcuts that let staging bypass the normal server-backed app flow.
