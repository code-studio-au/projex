import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Kysely, PostgresDialect, type PostgresDialectConfig } from 'kysely';
import { Migrator } from 'kysely/migration';

import { createPgPool, type TypedPgPool } from '../src/server/db/pgPool.ts';
import { SqlFileMigrationProvider } from '../src/server/db/sqlFileMigrationProvider.ts';

const migrationUpgradeDatabaseUrl =
  process.env.PROJEX_MIGRATION_UPGRADE_DATABASE_URL?.trim() ?? '';
const migrationFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/server/db/migrations'
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
  'production migrations preserve and forward-repair N-1 audit compatibility',
  { skip: !migrationUpgradeDatabaseUrl },
  async () => {
    const setupPool = createPgPool(migrationUpgradeDatabaseUrl);
    const setupDb = createMigrationDb(setupPool);

    try {
      const migrator = new Migrator({
        db: setupDb,
        provider: new SqlFileMigrationProvider(migrationFolder),
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
      await setupPool.query(`
        insert into audit_events (
          id,
          company_id,
          project_id,
          actor_user_id,
          event_class,
          event_type,
          entity_type,
          entity_id,
          reason,
          retention_class,
          created_at
        )
        values (
          'itest_upgrade_audit_preserved',
          'itest_upgrade_company',
          'itest_upgrade_project',
          'itest_upgrade_actor',
          'workflow',
          'transaction.reviewed',
          'transaction',
          'itest_upgrade_txn',
          'Legacy rollback compatibility fixture',
          'financial',
          now()
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

      const auditStorageResult = await verificationPool.query<{
        audit_table_exists: boolean;
        audit_mutation_function_exists: boolean;
        preserved_event_count: string;
      }>(`
        select
          to_regclass('public.audit_events') is not null
            as audit_table_exists,
          to_regprocedure('public.prevent_audit_event_mutation()') is not null
            as audit_mutation_function_exists,
          (
            select count(*)::text
            from audit_events
            where id = 'itest_upgrade_audit_preserved'
          ) as preserved_event_count
      `);
      assert.deepEqual(auditStorageResult.rows, [
        {
          audit_table_exists: true,
          audit_mutation_function_exists: true,
          preserved_event_count: '1',
        },
      ]);

      await verificationPool.query(`
        insert into audit_events (
          id,
          company_id,
          actor_user_id,
          event_class,
          event_type,
          entity_type,
          entity_id,
          reason,
          retention_class,
          created_at
        )
        values (
          'itest_upgrade_audit_n1_write',
          'itest_upgrade_company',
          'itest_upgrade_actor',
          'lifecycle',
          'company.updated',
          'company',
          'itest_upgrade_company',
          'N-1 write after logger release migration',
          'security',
          now()
        )
      `);

      // Reproduce an environment that already applied the original destructive
      // 0036, then prove the next forward migration repairs the N-1 contract.
      await verificationPool.query('drop table audit_events');
      await verificationPool.query(
        'drop function if exists prevent_audit_event_mutation()'
      );
      await verificationPool.query(`
        delete from kysely_migration
        where name = '0037_restore_audit_n1_compatibility.sql'
      `);

      runProductionMigrationPath(migrationUpgradeDatabaseUrl);

      await verificationPool.query(`
        insert into audit_events (
          id,
          company_id,
          actor_user_id,
          event_class,
          event_type,
          entity_type,
          entity_id,
          reason,
          retention_class,
          created_at
        )
        values (
          'itest_upgrade_audit_repaired_write',
          'itest_upgrade_company',
          'itest_upgrade_actor',
          'workflow',
          'transaction.reopened',
          'transaction',
          'itest_upgrade_txn',
          'N-1 write after forward repair',
          'financial',
          now()
        )
      `);
      await assert.rejects(
        verificationPool.query(`
          update audit_events
          set reason = 'Mutation must remain blocked'
          where id = 'itest_upgrade_audit_repaired_write'
        `),
        /audit events are immutable/u
      );

      const repairedAuditStorageResult = await verificationPool.query<{
        audit_table_exists: boolean;
        audit_mutation_function_exists: boolean;
        repaired_event_count: string;
      }>(`
        select
          to_regclass('public.audit_events') is not null
            as audit_table_exists,
          to_regprocedure('public.prevent_audit_event_mutation()') is not null
            as audit_mutation_function_exists,
          (
            select count(*)::text
            from audit_events
            where id = 'itest_upgrade_audit_repaired_write'
          ) as repaired_event_count
      `);
      assert.deepEqual(repairedAuditStorageResult.rows, [
        {
          audit_table_exists: true,
          audit_mutation_function_exists: true,
          repaired_event_count: '1',
        },
      ]);

      const historyResult = await verificationPool.query<{ name: string }>(`
        select name
        from kysely_migration
        where name in (
          '0033_transaction_search.sql',
          '0034_project_company_ownership.sql',
          '0036_drop_audit_events.sql',
          '0037_restore_audit_n1_compatibility.sql'
        )
        order by name
      `);
      assert.deepEqual(
        historyResult.rows.map((row) => row.name),
        [
          '0033_transaction_search.sql',
          '0034_project_company_ownership.sql',
          '0036_drop_audit_events.sql',
          '0037_restore_audit_n1_compatibility.sql',
        ]
      );
    } finally {
      await verificationPool.end();
    }
  }
);
