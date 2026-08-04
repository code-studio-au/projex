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

GitHub CodeQL, Dependabot, and secret scanning complement the five required CI
jobs. New work must not introduce unresolved security findings. Treat new
findings as defects to fix in the same change rather than accepting them as
later cleanup.

Before running the browser smoke lane locally for the first time on a machine:

```bash
pnpm exec playwright install --with-deps chromium firefox webkit
```

Targeted useful commands:

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
pnpm run test:integration:db
pnpm run verify:smoke:full
pnpm run smoke:server:disposable -- --section=basics
pnpm run smoke:browser:disposable -- --section=basics
```

## Architecture Notes

- App-compilable code may cross into server behavior only through `src/api/**`
  contracts and `src/server/start/functions/**`.
- API route files should stay transport-only and use `src/server/routes/**`
  adapters for server-only orchestration.
- Shared business logic belongs in `src/server/fns/**`.
- Request/session verification should flow through normalized request context
  rather than duplicate user/session checks inside feature modules.

See the [architecture boundaries](docs/architecture/architecture-boundaries.md).

Database schema changes must follow the forward-only expand/migrate/contract
policy in [database migrations](docs/development/database-migrations.md). A
migration-bearing release must remain compatible with the immediately previous
application release because application rollback does not reverse committed
database migrations.
