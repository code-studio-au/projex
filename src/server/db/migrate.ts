import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { Kysely, PostgresDialect, type PostgresDialectConfig } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';

import { requireDatabaseUrl } from '../env.ts';
import { loadEnvFiles } from '../envFiles.ts';
import { buildBetterAuthOptions } from '../auth/betterAuthInstance.ts';
import { createPgPool, type TypedPgPool } from './pgPool.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KYSELY_MIGRATIONS_DIR = path.join(__dirname, 'kysely-migrations');
const KYSELY_MIGRATION_TABLE = 'kysely_migration';
const KYSELY_MIGRATION_LOCK_TABLE = 'kysely_migration_lock';
const BASELINE_MIGRATION_NAME = '0001_init.sql';
const APP_SCHEMA_SENTINEL_TABLE = 'public.companies';

type KyselyMigrationRow = { name: string };
type ToRegclassRow = { table_name: string | null };

type Queryable = Pick<TypedPgPool, 'query'>;
const MIGRATION_ADVISORY_LOCK_ID = 7_021_115_091;

async function acquireMigrationLock(pool: Queryable) {
  await pool.query('select pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
}

async function releaseMigrationLock(pool: Queryable) {
  await pool.query('select pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
}

function createMigrationDb(pool: TypedPgPool) {
  return new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: pool as unknown as PostgresDialectConfig['pool'],
    }),
  });
}

async function doesTableExist(pool: Queryable, tableName: string) {
  const result = await pool.query<ToRegclassRow>(
    'select to_regclass($1) as table_name',
    [tableName]
  );
  return Boolean(result.rows[0]?.table_name);
}

async function ensureKyselyMigrationTables(pool: Queryable) {
  await pool.query(`
    create table if not exists ${KYSELY_MIGRATION_TABLE} (
      name varchar(255) primary key,
      timestamp varchar(255) not null
    )
  `);
  await pool.query(`
    create table if not exists ${KYSELY_MIGRATION_LOCK_TABLE} (
      id varchar(255) primary key,
      is_locked integer not null default 0
    )
  `);
  await pool.query(
    `insert into ${KYSELY_MIGRATION_LOCK_TABLE}(id, is_locked)
     values ('migration_lock', 0)
     on conflict (id) do nothing`
  );
}

async function syncExistingSchemaToBaseline(pool: Queryable) {
  const hasAppSchema = await doesTableExist(pool, APP_SCHEMA_SENTINEL_TABLE);
  if (!hasAppSchema) return;

  await ensureKyselyMigrationTables(pool);

  const existing = await pool.query<KyselyMigrationRow>(
    `select name from ${KYSELY_MIGRATION_TABLE} order by name`
  );

  if (
    existing.rows.length === 1 &&
    existing.rows[0]?.name === BASELINE_MIGRATION_NAME
  ) {
    return;
  }

  await pool.query('begin');
  try {
    await pool.query(`delete from ${KYSELY_MIGRATION_TABLE}`);
    await pool.query(
      `insert into ${KYSELY_MIGRATION_TABLE}(name, timestamp)
       values ($1, $2)`,
      [BASELINE_MIGRATION_NAME, new Date().toISOString()]
    );
    await pool.query('drop table if exists schema_migrations');
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

async function runAppMigrations(db: Kysely<Record<string, never>>) {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: KYSELY_MIGRATIONS_DIR,
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      console.log(`Applied migration: ${result.migrationName}`);
    }
  }

  if (error) {
    throw error;
  }
}

async function run() {
  loadEnvFiles();

  const connectionString = requireDatabaseUrl();
  const pool = createPgPool(connectionString);
  const db = createMigrationDb(pool);

  await acquireMigrationLock(pool);

  try {
    const hasBetterAuthEnv =
      Boolean(process.env.BETTER_AUTH_SECRET?.trim()) &&
      Boolean(process.env.BETTER_AUTH_URL?.trim());

    if (hasBetterAuthEnv) {
      const { runMigrations } = await getMigrations(buildBetterAuthOptions());
      await runMigrations();
    } else {
      console.warn(
        '[db:migrate] Skipping BetterAuth migrations (set BETTER_AUTH_SECRET and BETTER_AUTH_URL to enable)'
      );
    }

    await syncExistingSchemaToBaseline(pool);
    await runAppMigrations(db);
  } finally {
    try {
      await releaseMigrationLock(pool);
    } catch {
      // Best effort unlock on shutdown/error path.
    }
    await db.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
