import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Kysely, PostgresDialect, type PostgresDialectConfig } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';

import { createPgPool, type TypedPgPool } from '../src/server/db/pgPool.ts';

const migrationUpgradeDatabaseUrl =
  process.env.PROJEX_MIGRATION_UPGRADE_DATABASE_URL?.trim() ?? '';
const migrationFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/server/db/kysely-migrations'
);
const PRE_TRANSACTION_SEARCH_MIGRATION = '0032_workflow_taxonomy_integrity.sql';

function createMigrationDb(pool: TypedPgPool) {
  return new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: pool as unknown as PostgresDialectConfig['pool'],
    }),
  });
}

function runProductionMigrationPath(connectionString: string) {
  const result = spawnSync('pnpm', ['run', 'db:migrate'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      BETTER_AUTH_SECRET: '',
      BETTER_AUTH_URL: '',
      BETTER_AUTH_TRUSTED_ORIGINS: '',
      NODE_ENV: 'test',
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    [
      'The production migration runner failed while upgrading populated data.',
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join('\n')
  );
}

test(
  'production migrations upgrade populated data across 0033 and 0034',
  { skip: !migrationUpgradeDatabaseUrl },
  async () => {
    const setupPool = createPgPool(migrationUpgradeDatabaseUrl);
    const setupDb = createMigrationDb(setupPool);

    try {
      const migrator = new Migrator({
        db: setupDb,
        provider: new FileMigrationProvider({
          fs,
          path,
          migrationFolder,
        }),
      });
      const { error, results } = await migrator.migrateTo(
        PRE_TRANSACTION_SEARCH_MIGRATION
      );

      assert.ifError(error);
      assert.equal(
        results?.at(-1)?.migrationName,
        PRE_TRANSACTION_SEARCH_MIGRATION
      );
      assert.equal(results?.at(-1)?.status, 'Success');

      await setupPool.query(`
        insert into companies (id, name, status)
        values ('itest_upgrade_company', 'Migration Upgrade Company', 'active')
      `);
      await setupPool.query(`
        insert into projects (
          id,
          company_id,
          name,
          currency,
          status,
          visibility
        )
        values (
          'itest_upgrade_project',
          'itest_upgrade_company',
          'Migration Upgrade Project',
          'AUD',
          'active',
          'private'
        )
      `);
      await setupPool.query(`
        insert into txns (
          public_id,
          external_id,
          company_id,
          project_id,
          txn_date,
          item,
          description,
          amount_cents,
          import_source_type,
          import_source_meta
        )
        values (
          'itest_upgrade_txn',
          'UPGRADE-0033-0034',
          'itest_upgrade_company',
          'itest_upgrade_project',
          '2026-07-01',
          'Populated migration fixture',
          'Existing transaction upgraded through search backfill',
          12345,
          'powerbi_expenditure_actuals',
          '{"Reference Num":"UPGRADE-REFERENCE"}'::jsonb
        )
      `);
    } finally {
      await setupDb.destroy();
    }

    runProductionMigrationPath(migrationUpgradeDatabaseUrl);

    const verificationPool = createPgPool(migrationUpgradeDatabaseUrl);
    try {
      const txnResult = await verificationPool.query<{
        company_id: string;
        project_id: string;
        search_text: string;
      }>(`
        select company_id, project_id, search_text
        from txns
        where public_id = 'itest_upgrade_txn'
      `);
      assert.deepEqual(
        txnResult.rows.map((row) => ({
          companyId: row.company_id,
          projectId: row.project_id,
        })),
        [
          {
            companyId: 'itest_upgrade_company',
            projectId: 'itest_upgrade_project',
          },
        ]
      );
      assert.match(
        txnResult.rows[0]?.search_text ?? '',
        /populated migration fixture/
      );
      assert.match(txnResult.rows[0]?.search_text ?? '', /upgrade-reference/);

      const constraintResult = await verificationPool.query<{
        convalidated: boolean;
      }>(`
        select convalidated
        from pg_constraint
        where conname = 'fk_txns_project_company'
      `);
      assert.deepEqual(constraintResult.rows, [{ convalidated: true }]);

      const historyResult = await verificationPool.query<{ name: string }>(`
        select name
        from kysely_migration
        where name in (
          '0033_transaction_search.sql',
          '0034_project_company_ownership.sql'
        )
        order by name
      `);
      assert.deepEqual(
        historyResult.rows.map((row) => row.name),
        ['0033_transaction_search.sql', '0034_project_company_ownership.sql']
      );
    } finally {
      await verificationPool.end();
    }
  }
);
