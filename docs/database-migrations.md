# Database Migrations

Projex currently uses a mixed migration history:

- `0001_init.sql` is a historical bootstrap baseline for fresh environments.
- later numbered files are incremental migrations applied in order by `src/server/db/migrate.ts`.

## Current rule

- Treat `0001_init.sql` as legacy baseline history, not as the place for new feature work.
- Add all new schema changes as forward-only incremental migrations.
- Prefer small migrations that do one thing well and are easy to reason about in review.
- If a future cleanup squashes the migration history again, do it intentionally and document the new baseline in this file.

## Safety expectations

- New foreign keys or checks that use `NOT VALID` should be followed by a later `VALIDATE CONSTRAINT` migration once the data backfill is complete.
- Avoid SQL constructs that require hand-editing the migration runner unless they are covered by tests. `tests/migrationSql.test.ts` exists to protect statement splitting for strings, comments, and dollar-quoted bodies.
- Keep production-safe rollback thinking in mind, but migrations should still be written as forward fixes first.

## Operational note

`pnpm run db:migrate` applies Better Auth migrations first when auth env vars are available, then applies app SQL migrations from `src/server/db/migrations`.
