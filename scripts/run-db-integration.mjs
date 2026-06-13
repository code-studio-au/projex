import fs from 'node:fs';
import path from 'node:path';

import {
  runProjexCommand,
  runProjexMigrations,
  startDisposablePostgres,
} from './disposable-postgres.mjs';

const KEEP_DB = process.argv.includes('--keep-db');
const DB_NAME = 'projex_integration_test';

function loadEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

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
    await runProjexMigrations({ connectionString });

    runProjexCommand(
      'node',
      ['--import', 'tsx', '--test', 'tests/dbIntegration.test.ts'],
      {
        env: {
          DATABASE_URL: connectionString,
          PROJEX_INTEGRATION_DATABASE_URL: connectionString,
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
