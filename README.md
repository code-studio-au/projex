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
# Apply SQL migrations to DATABASE_URL
npm run db:migrate

# Run adapter contract checks (LocalApi + ServerApi stubs)
npm run test:contracts
```

- Transition map: `docs/server-transition-map.md`
- DB migrations: `src/server/db/migrations`

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
