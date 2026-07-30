import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { Kysely, PostgresDialect, type PostgresDialectConfig } from 'kysely';
import { Migrator } from 'kysely/migration';

import { requireDatabaseUrl } from '../env.ts';
import { loadEnvFiles } from '../envFiles.ts';
import { buildBetterAuthOptions } from '../auth/betterAuthInstance.ts';
import { createPgPool, type TypedPgPool } from './pgPool.ts';
import { SqlFileMigrationProvider } from './sqlFileMigrationProvider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const BASELINE_MIGRATION_NAME = '0001_init.sql';
const APP_SCHEMA_SENTINEL_TABLE = 'public.companies';
const LEGACY_APP_MIGRATION_NAMES = new Set([
  '0001_init.sql',
  '0002_project_budget_total.sql',
  '0003_project_superadmin_access.sql',
  '0004_email_change_requests.sql',
  '0005_drop_project_description.sql',
  '0006_company_default_taxonomy.sql',
  '0007_company_default_mapping_rules.sql',
  '0008_global_superadmin.sql',
  '0009_company_role_cleanup.sql',
  '0010_company_membership_role_constraint.sql',
  '0011_resource_ownership_constraints.sql',
  '0012_transaction_accounting_metadata.sql',
  '0013_programmes.sql',
  '0014_transaction_comments.sql',
  '0015_transaction_review_workflow.sql',
  '0016_signed_transaction_amounts.sql',
  '0017_powerbi_import_foundations.sql',
  '0018_import_rule_ledger_field.sql',
  '0019_project_transfer_toggle.sql',
  '0019_user_disabled_reason.sql',
  '0020_validate_resource_ownership_constraints.sql',
  '0021_request_rate_limits.sql',
  '0022_remove_regex_import_rule_operator.sql',
]);

type KyselyMigrationRow = { name: string };
type ToRegclassRow = { table_name: string | null };

type Queryable = Pick<TypedPgPool, 'query'>;
const MIGRATION_ADVISORY_LOCK_ID = 7_021_115_091;

async function acquireMigrationLock(pool: Queryable) {
  await pool.query('select pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
}

async function releaseMigrationLock(pool: Queryable) {
  await pool.query('select pg_advisory_unlock($1)', [
    MIGRATION_ADVISORY_LOCK_ID,
  ]);
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
    create table if not exists kysely_migration (
      name varchar(255) primary key,
      timestamp varchar(255) not null
    )
  `);
  await pool.query(`
    create table if not exists kysely_migration_lock (
      id varchar(255) primary key,
      is_locked integer not null default 0
    )
  `);
  await pool.query(
    `insert into kysely_migration_lock(id, is_locked)
     values ('migration_lock', 0)
     on conflict (id) do nothing`
  );
}

async function getCurrentAppMigrationNames(): Promise<Set<string>> {
  return new Set(
    Object.keys(
      await new SqlFileMigrationProvider(APP_MIGRATIONS_DIR).getMigrations()
    )
  );
}

async function syncExistingSchemaToBaseline(pool: Queryable) {
  const hasAppSchema = await doesTableExist(pool, APP_SCHEMA_SENTINEL_TABLE);
  if (!hasAppSchema) return;

  await ensureKyselyMigrationTables(pool);
  const [hasLegacySchemaMigrations, existing, currentAppMigrationNames] =
    await Promise.all([
      doesTableExist(pool, 'public.schema_migrations'),
      pool.query<KyselyMigrationRow>(
        'select name from kysely_migration order by name'
      ),
      getCurrentAppMigrationNames(),
    ]);

  if (
    existing.rows.length === 1 &&
    existing.rows[0]?.name === BASELINE_MIGRATION_NAME
  ) {
    if (hasLegacySchemaMigrations) {
      await pool.query('drop table if exists schema_migrations');
    }
    return;
  }

  const hasCurrentKyselyHistory =
    existing.rows.length > 0 &&
    existing.rows.every((row) => currentAppMigrationNames.has(row.name));

  if (hasCurrentKyselyHistory && !hasLegacySchemaMigrations) {
    return;
  }

  const hasOnlyRecognizedLegacyHistory =
    existing.rows.length > 0 &&
    existing.rows.every((row) => LEGACY_APP_MIGRATION_NAMES.has(row.name));

  if (!hasLegacySchemaMigrations && !hasOnlyRecognizedLegacyHistory) {
    const reason =
      existing.rows.length === 0
        ? 'Existing application tables were found without legacy migration history.'
        : `Unrecognized migration history found: ${existing.rows
            .map((row) => row.name)
            .join(', ')}`;
    throw new Error(
      `${reason} Reset the database or align it manually before running the squashed baseline migration.`
    );
  }

  await pool.query('begin');
  try {
    await pool.query('delete from kysely_migration');
    await pool.query(
      `insert into kysely_migration(name, timestamp)
       values ($1, $2)`,
      [BASELINE_MIGRATION_NAME, new Date().toISOString()]
    );
    if (hasLegacySchemaMigrations) {
      await pool.query('drop table if exists schema_migrations');
    }
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }
}

async function runAppMigrations(db: Kysely<Record<string, never>>) {
  const migrator = new Migrator({
    db,
    provider: new SqlFileMigrationProvider(APP_MIGRATIONS_DIR),
  });

  // Kysely wraps every migration selected by migrateToLatest in one
  // transaction. A data migration can leave deferred trigger events pending,
  // which prevents a later migration in that transaction from altering the
  // same table (PostgreSQL 55006). Running one step at a time keeps each
  // migration atomic while giving PostgreSQL a commit boundary between them.
  while (true) {
    const { error, results } = await migrator.migrateUp();

    if (error) {
      throw error;
    }

    const result = results?.[0];
    if (!result) {
      return;
    }

    if (result.status !== 'Success') {
      throw new Error(
        `Migration ${result.migrationName} finished with status ${result.status}`
      );
    }

    console.log(`Applied migration: ${result.migrationName}`);
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
