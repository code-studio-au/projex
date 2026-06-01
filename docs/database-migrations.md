# Database Migrations

Projex now uses a squashed app migration baseline:

- `src/server/db/migrations/0001_init.sql` is the current full-schema app baseline.
- `src/server/db/kysely-migrations/0001_init.sql.ts` is the Kysely migration module that executes that baseline.
- future app schema changes should be added as new forward-only Kysely migrations after the baseline.

## Current rule

- Treat `0001_init.sql` as the frozen baseline, not as the place for new feature work.
- Add new schema changes as forward-only migrations after the baseline.
- Prefer small migrations that do one thing well and are easy to reason about in review.
- If the history is squashed again later, do it intentionally and document the new baseline in this file.

## Safety expectations

- Keep migrations as forward-only operational changes unless you have a specific tested need for `down` support.
- Keep production-safe rollback thinking in mind, but migrations should still be written as forward fixes first.

## Operational note

`pnpm run db:migrate` applies Better Auth migrations first when auth env vars are available, then applies app migrations through Kysely using the modules in `src/server/db/kysely-migrations`.

Current structure:

- `src/server/db/migrations/0001_init.sql` is the canonical app baseline SQL.
- `src/server/db/kysely-migrations/*.ts` is the Kysely migration module layer.
- existing local databases that were created before the squash are synced once onto the new baseline marker in `kysely_migration`.

Current runner safeguards:

- the migration command takes a Postgres advisory lock before running Better Auth or Kysely app migrations, so concurrent deploys do not race each other
- `pnpm run start:server` does not auto-run migrations unless `PROJEX_RUN_MIGRATIONS=true` is set explicitly
- production deploys should still treat `pnpm run db:migrate` as an explicit pre-restart step rather than relying on runtime startup behavior
