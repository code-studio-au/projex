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

## Deployment compatibility contract

Projex uses forward-only database migrations. Application rollback changes the
active release symlink; it does not and must not attempt to reverse an already
committed database migration. Every migration shipped in release `N` must
therefore remain compatible with both release `N` and the immediately previous
application release `N-1`.

Use an expand/migrate/contract sequence:

1. **Expand:** add nullable columns, new tables, indexes, or parallel structures
   without removing or changing anything the previous release reads or writes.
2. **Migrate:** deploy code that can use the expanded schema, backfill data in
   bounded and restartable operations, and stop relying on the old structure.
3. **Contract:** remove the old structure only in a later release, after it is
   no longer used by any deployed instance and is no longer needed by the
   application rollback candidate.

The following changes must not be introduced in the same release that first
stops using the old contract:

- dropping or renaming a table, column, constraint, enum value, or index relied
  on by `N-1`;
- changing a column type in a way `N-1` cannot read or write;
- making an existing nullable column required before all rows are backfilled
  and both releases write valid values;
- removing compatibility reads or dual writes before the contract deployment.

When a deployment fails after migration, leave the forward migration applied,
restore `N-1`, and investigate with the schema in its expanded compatible
state. Repair migration defects with a new forward migration. Do not improvise
an automatic production `down` migration.

Every pull request containing a schema migration must explain its expand,
migrate, and eventual contract phases, confirm `N-1` compatibility, and include
rollback evidence. A destructive contract migration must identify the earlier
release that removed the dependency and prove it is no longer a rollback
candidate.

## Operational note

`pnpm run db:migrate` applies Better Auth migrations first when auth env vars are available, then applies app migrations through Kysely using the modules in `src/server/db/kysely-migrations`.

## Generated DB types

Projex now treats the live database schema as the source of truth for Kysely table typing:

- `src/server/db/generated/db.d.ts` is generated from the current database schema using `kysely-codegen`
- `src/server/db/schema.ts` is the thin app-owned wrapper that preserves intentional domain refinements and runtime-friendly JSON column typing
- JSONB columns that the app writes as plain objects stay object-shaped in the wrapper rather than switching to Kysely's default stringified `JSONColumnType` insert/update contract

Workflow:

- run `pnpm run db:migrate` before regenerating types against a changed local schema
- run `pnpm run db:generate-types` after schema changes
- run `pnpm run db:verify-types` in verification flows to catch drift between the committed generated file and the actual database schema

Expectations:

- do not hand-edit `src/server/db/generated/db.d.ts`
- keep generated output raw so `db:verify-types` compares against the exact codegen output
- put app-specific overrides in `src/server/db/schema.ts` or `src/server/db/generated/custom-types.ts`, not in the generated file

Current structure:

- `src/server/db/migrations/0001_init.sql` is the canonical app baseline SQL.
- `src/server/db/kysely-migrations/*.ts` is the Kysely migration module layer.
- existing local databases that were created before the squash are synced once onto the new baseline marker in `kysely_migration`.

Current runner safeguards:

- the migration command takes a Postgres advisory lock before running Better Auth or Kysely app migrations, so concurrent deploys do not race each other
- `pnpm run start:server` does not auto-run migrations unless `PROJEX_RUN_MIGRATIONS=true` is set explicitly
- production deploys should still treat `pnpm run db:migrate` as an explicit pre-restart step rather than relying on runtime startup behavior
- deploy-path tests must continue proving that a successful migration remains
  applied when readiness failure restores the compatible previous application
  release

Ownership migrations should prefer composite company/project foreign keys for
live operational state. Append-only audit records are the deliberate exception:
their entity IDs remain historical soft references so project deletion cannot
erase or invalidate immutable history.
