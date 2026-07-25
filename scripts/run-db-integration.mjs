import {
  runProjexCommand,
  runProjexMigrations,
  startDisposablePostgres,
} from './disposable-postgres.mjs';
import { loadEnvFile } from './env-file.mjs';

const KEEP_DB = process.argv.includes('--keep-db');
const DB_NAME = 'projex_integration_test';
const MIGRATION_UPGRADE_DB_NAME = 'projex_migration_upgrade_test';

async function main() {
  loadEnvFile('.env.local');

  const pg = await startDisposablePostgres({
    containerPrefix: 'projex-integration-db',
  });

  const connectionString = pg.connectionString(DB_NAME);
  console.info(
    `[itest] Started disposable Postgres ${pg.containerName} on ${pg.host}:${pg.port}`
  );

  try {
    await pg.createDatabase(DB_NAME);
    await pg.createDatabase(MIGRATION_UPGRADE_DB_NAME);
    await runProjexMigrations({ connectionString });

    runProjexCommand(
      'node',
      ['--import', 'tsx', '--test', 'tests/dbIntegration*.test.ts'],
      {
        env: {
          DATABASE_URL: connectionString,
          PROJEX_INTEGRATION_DATABASE_URL: connectionString,
          PROJEX_MIGRATION_UPGRADE_DATABASE_URL: pg.connectionString(
            MIGRATION_UPGRADE_DB_NAME
          ),
        },
      }
    );
  } finally {
    if (KEEP_DB) {
      console.info(
        `[itest] Keeping disposable Postgres container ${pg.containerName} alive for debugging.`
      );
    } else {
      await pg.stop();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
