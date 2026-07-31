import {
  runProjexCommand,
  runProjexMigrations,
  startDisposablePostgres,
} from './disposable-postgres.mjs';
import { loadEnvFile } from './env-file.mjs';
import pgPackage from 'pg';

const KEEP_DB = process.argv.includes('--keep-db');
const VERIFY_GATE = process.argv.includes('--verify-gate');
const REUSE_EXISTING_SERVER =
  process.env.PROJEX_TEST_DB_REUSE_SERVER?.trim().toLowerCase() === 'true';
const DB_NAME = 'projex_integration_test';
const MIGRATION_UPGRADE_DB_NAME = 'projex_migration_upgrade_test';
const DATABASE_NAMES = [DB_NAME, MIGRATION_UPGRADE_DB_NAME];
const { Client } = pgPackage;

function quotePostgresIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function connectionStringForDatabase(connectionString, database) {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function useExistingPostgresServer(connectionString) {
  const adminClient = new Client({
    connectionString: connectionStringForDatabase(connectionString, 'postgres'),
  });
  await adminClient.connect();

  return {
    description: `existing PostgreSQL server ${new URL(connectionString).host}`,
    connectionString(database) {
      return connectionStringForDatabase(connectionString, database);
    },
    async createDatabase(database) {
      if (!DATABASE_NAMES.includes(database)) {
        throw new Error(
          `Refusing to provision unexpected test database ${database}`
        );
      }
      await adminClient.query(
        `DROP DATABASE IF EXISTS ${quotePostgresIdentifier(database)} WITH (FORCE)`
      );
      await adminClient.query(
        `CREATE DATABASE ${quotePostgresIdentifier(database)}`
      );
    },
    async stop() {
      try {
        for (const database of [...DATABASE_NAMES].reverse()) {
          await adminClient.query(
            `DROP DATABASE IF EXISTS ${quotePostgresIdentifier(database)} WITH (FORCE)`
          );
        }
      } finally {
        await adminClient.end();
      }
    },
    async disconnect() {
      await adminClient.end();
    },
  };
}

async function provisionPostgresServer() {
  if (REUSE_EXISTING_SERVER) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is required when PROJEX_TEST_DB_REUSE_SERVER=true'
      );
    }
    return await useExistingPostgresServer(connectionString);
  }

  const disposable = await startDisposablePostgres({
    containerPrefix: 'projex-integration-db',
  });
  return {
    ...disposable,
    description: `disposable Postgres ${disposable.containerName} on ${disposable.host}:${disposable.port}`,
    disconnect: async () => {},
  };
}

async function main() {
  loadEnvFile('.env.local');

  const databaseServer = await provisionPostgresServer();

  const connectionString = databaseServer.connectionString(DB_NAME);
  console.info(`[itest] Using ${databaseServer.description}`);

  try {
    await databaseServer.createDatabase(DB_NAME);
    await databaseServer.createDatabase(MIGRATION_UPGRADE_DB_NAME);
    await runProjexMigrations({ connectionString });

    if (VERIFY_GATE) {
      runProjexCommand('pnpm', ['run', 'db:verify-types'], {
        env: {
          DATABASE_URL: connectionString,
          PG_ALLOW_EXIT_ON_IDLE: 'true',
        },
      });
    }

    runProjexCommand(
      'node',
      ['--import', 'tsx', '--test', 'tests/dbIntegration*.test.ts'],
      {
        env: {
          DATABASE_URL: connectionString,
          PROJEX_INTEGRATION_DATABASE_URL: connectionString,
          PROJEX_MIGRATION_UPGRADE_DATABASE_URL:
            databaseServer.connectionString(MIGRATION_UPGRADE_DB_NAME),
          PG_ALLOW_EXIT_ON_IDLE: 'true',
        },
      }
    );
  } finally {
    if (KEEP_DB) {
      console.info(`[itest] Keeping integration test databases for debugging.`);
      await databaseServer.disconnect();
    } else {
      await databaseServer.stop();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
