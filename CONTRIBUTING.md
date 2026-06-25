# Contributing

## Workflow

- Create a branch for non-trivial changes.
- Keep changes scoped and cohesive.
- Prefer improving existing docs over adding overlapping new docs.
- Run the relevant verification commands before opening a PR.

## Setup

```bash
corepack enable
pnpm install
cp .env.local.example .env.local
pnpm run dev
```

Use Node `24` as pinned in `.nvmrc` and `.node-version`.

Optional manual smoke setup:

```bash
cp .env.smoke.example .env.smoke.local
```

For local Postgres + MinIO:

```bash
docker compose -f compose.local.yaml up -d
```

## Verification

Fast local pass:

```bash
pnpm run verify:security
```

Full local/CI-shaped pass:

```bash
pnpm run verify:ci
```

Targeted useful commands:

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
pnpm run test:integration:db
pnpm run smoke:server:disposable -- --section=basics
pnpm run smoke:browser:disposable -- --section=basics
```

## Architecture Notes

- App-compilable code may cross into server behavior only through `src/api/**`
  contracts and `src/server/start/functions/**`.
- API route files should stay transport-only and use `src/server/routes/**`
  adapters for server-only orchestration.
- Shared business logic belongs in `src/server/fns/**`.

See [docs/architecture-boundaries.md](/Users/scas0196/Documents/code/projex/docs/architecture-boundaries.md:1).
