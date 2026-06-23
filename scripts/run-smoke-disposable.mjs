import {
  runProjexCommand,
  runProjexMigrations,
  spawnProjexCommand,
  startDisposableMinio,
  startDisposablePostgres,
  stopChildProcess,
  waitForHttpOk,
} from './disposable-postgres.mjs';

const KEEP_DB = process.argv.includes('--keep-db');
const SKIP_BUILD = process.argv.includes('--skip-build');
const RUN_BROWSER = process.argv.includes('--browser');
const FORWARDED_ARGS = process.argv.filter(
  (arg) =>
    arg !== '--keep-db' && arg !== '--skip-build' && arg !== '--browser'
);
const DB_NAME = 'projex_smoke_test';
const HOST = '127.0.0.1';
const PORT = Number.parseInt(
  process.env.PROJEX_SMOKE_SERVER_PORT ?? '3310',
  10
);
const BETTER_AUTH_SECRET =
  process.env.PROJEX_TEST_BETTER_AUTH_SECRET ||
  'projex-disposable-smoke-secret-0123456789';

async function main() {
  if (Number.isNaN(PORT)) {
    throw new Error('PROJEX_SMOKE_SERVER_PORT must be a valid integer');
  }

  const baseUrl = `http://${HOST}:${PORT}`;
  const pg = await startDisposablePostgres({
    containerPrefix: 'projex-smoke-db',
  });
  const minio = await startDisposableMinio({
    containerPrefix: 'projex-smoke-s3',
    bucket: 'projex-exports',
  });
  const connectionString = pg.connectionString(DB_NAME);
  let serverProcess = null;

  console.info(
    `[smoke] Started disposable Postgres ${pg.containerName} on ${pg.host}:${pg.port}`
  );

  try {
    await pg.createDatabase(DB_NAME);
    await runProjexMigrations({
      connectionString,
      betterAuthBaseUrl: baseUrl,
      betterAuthSecret: BETTER_AUTH_SECRET,
    });

    if (!SKIP_BUILD) {
      runProjexCommand('pnpm', ['run', 'build']);
    }

    const sharedEnv = {
      DATABASE_URL: connectionString,
      BETTER_AUTH_SECRET: BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_TRUSTED_ORIGINS: baseUrl,
      CORS_ALLOWED_ORIGINS: baseUrl,
      NODE_ENV: 'test',
      PROJEX_ENABLE_DEV_ENDPOINTS: 'false',
      PROJEX_ENABLE_SMOKE_TOOLS: 'false',
      PROJEX_RUN_MIGRATIONS: 'false',
      PROJEX_SMOKE_BASE_URL: baseUrl,
      S3_BUCKET: minio.bucket,
      S3_REGION: minio.region,
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKey,
      S3_SECRET_ACCESS_KEY: minio.secretKey,
      S3_FORCE_PATH_STYLE: 'true',
      HOST,
      PORT: String(PORT),
    };

    serverProcess = spawnProjexCommand(
      'node',
      ['--experimental-strip-types', 'scripts/start-server.mjs'],
      {
        env: sharedEnv,
      }
    );
    await waitForHttpOk(`${baseUrl}/api/health`);

    runProjexCommand(
      'node',
      [
        'scripts/smoke-server.mjs',
        '--use-generated-fixtures',
        '--sweep-stale-fixtures',
        ...FORWARDED_ARGS,
      ],
      { env: sharedEnv }
    );

    if (RUN_BROWSER) {
      runProjexCommand(
        'node',
        [
          'scripts/smoke-browser.mjs',
          '--use-generated-fixtures',
          '--sweep-stale-fixtures',
          ...FORWARDED_ARGS,
        ],
        { env: sharedEnv }
      );
    }
  } finally {
    await stopChildProcess(serverProcess);

    if (KEEP_DB) {
      console.info(
        `[smoke] Keeping disposable Postgres container ${pg.containerName} alive for debugging.`
      );
    } else {
      await pg.stop();
    }
    await minio.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
