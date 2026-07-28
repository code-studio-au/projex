import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import {
  runProjexCommand,
  runProjexMigrations,
  spawnProjexCommand,
  startDisposableMinio,
  startDisposablePostgres,
  stopChildProcess,
  waitForHttpOk,
} from './disposable-postgres.mjs';
import { parseCliArgs } from './cli-args.mjs';
import { logNodeRuntime, resolveNodeExecutable } from './node-runtime.mjs';

const cliArgs = parseCliArgs(process.argv.slice(2), {
  booleanFlags: ['--browser', '--keep-db', '--skip-build'],
});
const KEEP_DB = cliArgs.flags.has('--keep-db');
const SKIP_BUILD = cliArgs.flags.has('--skip-build');
const RUN_BROWSER = cliArgs.flags.has('--browser');
const FORWARDED_ARGS = cliArgs.passthrough;
const DB_NAME = 'projex_smoke_test';
const HOST = '127.0.0.1';
const BETTER_AUTH_SECRET =
  process.env.PROJEX_TEST_BETTER_AUTH_SECRET ||
  'projex-disposable-smoke-secret-0123456789';
const NODE_EXECUTABLE = resolveNodeExecutable();

async function reserveSmokeServerPort() {
  const explicitPort = process.env.PROJEX_SMOKE_SERVER_PORT;
  if (explicitPort) {
    const parsed = Number.parseInt(explicitPort, 10);
    if (Number.isNaN(parsed)) {
      throw new Error('PROJEX_SMOKE_SERVER_PORT must be a valid integer');
    }
    return parsed;
  }

  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve smoke port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function runOpenSsl(args) {
  const result = spawnSync('openssl', args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr?.trim();
    throw new Error(
      `openssl req exited with code ${result.status ?? 'unknown'}${detail ? `: ${detail}` : ''}`
    );
  }
}

async function createSignedServerCertificate({
  caCertPath,
  caKeyPath,
  directory,
  name,
  serial,
}) {
  const keyPath = join(directory, `${name}.key`);
  const requestPath = join(directory, `${name}.csr`);
  const certPath = join(directory, `${name}.crt`);
  const extensionsPath = join(directory, `${name}.ext`);

  await writeFile(
    extensionsPath,
    [
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      'extendedKeyUsage=serverAuth',
      'keyUsage=digitalSignature,keyEncipherment',
    ].join('\n')
  );

  runOpenSsl([
    'req',
    '-new',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-keyout',
    keyPath,
    '-out',
    requestPath,
    '-subj',
    '/CN=localhost',
  ]);
  runOpenSsl([
    'x509',
    '-req',
    '-in',
    requestPath,
    '-CA',
    caCertPath,
    '-CAkey',
    caKeyPath,
    '-set_serial',
    String(serial),
    '-out',
    certPath,
    '-days',
    '2',
    '-sha256',
    '-extfile',
    extensionsPath,
  ]);

  return { certPath, keyPath };
}

async function createLocalTlsBundle() {
  const tempDir = await mkdtemp(join(tmpdir(), 'projex-smoke-tls-'));
  const postgresDirectory = join(tempDir, 'postgres');
  await mkdir(postgresDirectory, { mode: 0o700 });

  const caKeyPath = join(tempDir, 'ca.key');
  const caCertPath = join(tempDir, 'ca.crt');
  runOpenSsl([
    'req',
    '-x509',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-keyout',
    caKeyPath,
    '-out',
    caCertPath,
    '-days',
    '2',
    '-sha256',
    '-subj',
    '/CN=Projex Disposable Smoke CA',
  ]);

  const app = await createSignedServerCertificate({
    caCertPath,
    caKeyPath,
    directory: tempDir,
    name: 'app',
    serial: 1,
  });
  await createSignedServerCertificate({
    caCertPath,
    caKeyPath,
    directory: postgresDirectory,
    name: 'server',
    serial: 2,
  });

  return {
    appCertPath: app.certPath,
    appKeyPath: app.keyPath,
    caCertPath,
    postgresDirectory,
    tempDir,
  };
}

async function assertPostgresTls(connectionString, caCertPath) {
  const client = new pg.Client({
    connectionString,
    ssl: {
      ca: await readFile(caCertPath, 'utf8'),
      rejectUnauthorized: true,
    },
  });

  try {
    await client.connect();
    const result = await client.query(
      'select ssl from pg_stat_ssl where pid = pg_backend_pid()'
    );
    if (result.rows[0]?.ssl !== true) {
      throw new Error('Disposable Postgres connection is not using TLS.');
    }
    console.info('[smoke] Verified disposable Postgres TLS connection');
  } finally {
    await client.end();
  }
}

async function main() {
  logNodeRuntime('disposable smoke runner');
  const port = await reserveSmokeServerPort();

  const tls = await createLocalTlsBundle();
  const baseUrl = `https://localhost:${port}`;
  const pg = await startDisposablePostgres({
    containerPrefix: 'projex-smoke-db',
    tlsDirectory: tls.postgresDirectory,
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
      databaseSslCaFile: tls.caCertPath,
    });
    await assertPostgresTls(connectionString, tls.caCertPath);

    if (!SKIP_BUILD) {
      runProjexCommand('pnpm', ['run', 'build']);
    }

    const sharedEnv = {
      DATABASE_URL: connectionString,
      BETTER_AUTH_SECRET: BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_TRUSTED_ORIGINS: baseUrl,
      CORS_ALLOWED_ORIGINS: baseUrl,
      PROJEX_APP_BASE_URL: baseUrl,
      PROJEX_AUTH_RESET_REDIRECT_URL: `${baseUrl}/reset-password`,
      PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL: `${baseUrl}/verify-email-change`,
      NODE_ENV: 'test',
      PROJEX_ENABLE_DEV_ENDPOINTS: 'false',
      PROJEX_ENABLE_SMOKE_TOOLS: 'false',
      PROJEX_RUN_MIGRATIONS: 'false',
      PROJEX_SMOKE_BASE_URL: baseUrl,
      PG_SSL_CA_FILE: tls.caCertPath,
      PG_SSL_MODE: 'require',
      S3_BUCKET: minio.bucket,
      S3_REGION: minio.region,
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKey,
      S3_SECRET_ACCESS_KEY: minio.secretKey,
      S3_FORCE_PATH_STYLE: 'true',
      HOST,
      PORT: String(port),
      NODE_EXTRA_CA_CERTS: tls.caCertPath,
      PROJEX_NODE_EXECUTABLE: NODE_EXECUTABLE,
      PROJEX_TLS_KEY_FILE: tls.appKeyPath,
      PROJEX_TLS_CERT_FILE: tls.appCertPath,
    };

    serverProcess = spawnProjexCommand(
      NODE_EXECUTABLE,
      ['--import', 'tsx', 'scripts/start-server.mjs'],
      {
        env: sharedEnv,
      }
    );
    await waitForHttpOk(`${baseUrl}/api/health`, 30_000, {
      ca: await readFile(tls.caCertPath, 'utf8'),
    });

    runProjexCommand(
      NODE_EXECUTABLE,
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
        NODE_EXECUTABLE,
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
    await rm(tls.tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
