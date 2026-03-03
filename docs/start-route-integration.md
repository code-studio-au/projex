# TanStack Start Route Integration

This repo now has a server-only bridge and endpoint layer you can wire into TanStack Start routes.

## Server modules already prepared

- `src/server/api/startBridge.ts`
- `src/server/api/startServerApi.ts`

## Recommended Start route mapping

Use these file routes:

- `src/routes/api.companies.ts`
- `src/routes/api.companies.$companyId.projects.ts`
- `src/routes/api.projects.$projectId.ts`
- `src/routes/api.projects.$projectId.transactions.ts`
- `src/routes/api.projects.$projectId.transactions.import.ts`
- `src/routes/api.projects.$projectId.transactions.$txnId.ts`

## Example Start route file

Each file route uses `server.handlers` and calls `withApi(request, run)` in
`src/routes/-api-shared.ts`.

## Important boundary rule

Do not import `src/server/*` from client modules.

- Keep client adapter: `src/api/server/serverApi.ts` client-safe.
- Keep DB/auth imports in `src/server/*` only.

## Next migration actions

1. Install TanStack Start runtime dependencies in your environment.
2. Continue replacing client `ServerApi` stub calls with Start API route calls when enabling server mode in production.
3. Extend `src/routes/api.*` coverage for remaining domains (budgets/taxonomy/admin lifecycle).
