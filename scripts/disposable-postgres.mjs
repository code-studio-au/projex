import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const DEFAULT_IMAGE = process.env.PROJEX_TEST_DB_IMAGE || 'postgres:16-alpine';
const DEFAULT_USER = process.env.PROJEX_TEST_DB_USER || 'postgres';
const DEFAULT_PASSWORD = process.env.PROJEX_TEST_DB_PASSWORD || 'postgres';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MINIO_IMAGE =
  process.env.PROJEX_TEST_S3_IMAGE || 'minio/minio:latest';
const DEFAULT_MINIO_ACCESS_KEY =
  process.env.PROJEX_TEST_S3_ACCESS_KEY || 'minioadmin';
const DEFAULT_MINIO_SECRET_KEY =
  process.env.PROJEX_TEST_S3_SECRET_KEY || 'minioadmin';
const DEFAULT_BETTER_AUTH_SECRET =
  process.env.PROJEX_TEST_BETTER_AUTH_SECRET ||
  'projex-disposable-test-secret-0123456789';

function fail(message) {
  throw new Error(message);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'inherit',
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with code ${result.status ?? 'unknown'}`
    );
  }

  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createContainerName(prefix = 'projex-test-db') {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

function parseDockerPort(output) {
  const trimmed = output.trim();
  const match = trimmed.match(/:(\d+)\s*$/);
  if (!match) {
    fail(`Unable to parse docker port output: ${trimmed || '<empty>'}`);
  }
  return Number.parseInt(match[1], 10);
}

function makeConnectionString({ user, password, host, port, database }) {
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function ensureDockerAvailable() {
  try {
    runCommand('docker', ['version'], { stdio: 'ignore' });
  } catch {
    fail(
      'Docker is required for disposable test databases. Install Docker and make sure `docker version` works.'
    );
  }
}

export async function startDisposablePostgres(options = {}) {
  ensureDockerAvailable();

  const image = options.image ?? DEFAULT_IMAGE;
  const user = options.user ?? DEFAULT_USER;
  const password = options.password ?? DEFAULT_PASSWORD;
  const containerName =
    options.containerName ??
    createContainerName(options.containerPrefix ?? 'projex-test-db');

  const runResult = runCommand(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-e',
      `POSTGRES_USER=${user}`,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      'POSTGRES_DB=postgres',
      '-p',
      `${DEFAULT_HOST}::5432`,
      image,
    ],
    { stdio: 'pipe' }
  );

  const containerId = runResult.stdout.trim();
  if (!containerId) fail('Docker did not return a container id.');

  const portResult = runCommand('docker', ['port', containerName, '5432/tcp'], {
    stdio: 'pipe',
  });
  const port = parseDockerPort(portResult.stdout);

  const state = {
    containerId,
    containerName,
    image,
    user,
    password,
    host: DEFAULT_HOST,
    port,
  };

  await waitForPostgres(state);

  return {
    ...state,
    connectionString(database) {
      return makeConnectionString({ ...state, database });
    },
    async createDatabase(database) {
      runCommand('docker', [
        'exec',
        containerName,
        'createdb',
        '-U',
        user,
        database,
      ]);
    },
    async stop() {
      try {
        runCommand('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
      } catch {
        // Best effort cleanup.
      }
    },
  };
}

export async function startDisposableMinio(options = {}) {
  ensureDockerAvailable();

  const image = options.image ?? DEFAULT_MINIO_IMAGE;
  const accessKey = options.accessKey ?? DEFAULT_MINIO_ACCESS_KEY;
  const secretKey = options.secretKey ?? DEFAULT_MINIO_SECRET_KEY;
  const bucket = options.bucket ?? 'projex-exports';
  const region = options.region ?? 'us-east-1';
  const containerName =
    options.containerName ??
    createContainerName(options.containerPrefix ?? 'projex-test-s3');

  const runResult = runCommand(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-e',
      `MINIO_ROOT_USER=${accessKey}`,
      '-e',
      `MINIO_ROOT_PASSWORD=${secretKey}`,
      '-p',
      `${DEFAULT_HOST}::9000`,
      image,
      'server',
      '/data',
    ],
    { stdio: 'pipe' }
  );

  const containerId = runResult.stdout.trim();
  if (!containerId) fail('Docker did not return a MinIO container id.');

  const portResult = runCommand('docker', ['port', containerName, '9000/tcp'], {
    stdio: 'pipe',
  });
  const port = parseDockerPort(portResult.stdout);
  const endpoint = `http://${DEFAULT_HOST}:${port}`;

  await waitForHttpOk(`${endpoint}/minio/health/ready`);

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      })
    );
  } catch {
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
      })
    );
  }

  return {
    containerId,
    containerName,
    host: DEFAULT_HOST,
    port,
    endpoint,
    region,
    bucket,
    accessKey,
    secretKey,
    async stop() {
      try {
        runCommand('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
      } catch {
        // Best effort cleanup.
      }
    },
  };
}

async function waitForPostgres(state, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        state.containerName,
        'pg_isready',
        '-U',
        state.user,
        '-d',
        'postgres',
      ],
      { stdio: 'ignore' }
    );

    if (result.status === 0) {
      return;
    }

    await sleep(500);
  }

  fail(
    `Timed out waiting for disposable Postgres container ${state.containerName} to become ready.`
  );
}

export function runProjexCommand(command, args, options = {}) {
  const env = { ...process.env, ...(options.env ?? {}) };
  return runCommand(command, args, {
    cwd: options.cwd,
    env,
    stdio: options.stdio,
  });
}

export async function runProjexMigrations({
  connectionString,
  betterAuthBaseUrl = 'https://projex.test.invalid',
  betterAuthSecret = DEFAULT_BETTER_AUTH_SECRET,
}) {
  runProjexCommand('pnpm', ['run', 'db:migrate'], {
    env: {
      DATABASE_URL: connectionString,
      BETTER_AUTH_SECRET: betterAuthSecret,
      BETTER_AUTH_URL: betterAuthBaseUrl,
      BETTER_AUTH_TRUSTED_ORIGINS: betterAuthBaseUrl,
    },
  });
}

export async function waitForHttpOk(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await sleep(500);
  }

  fail(`Timed out waiting for ${url} to become ready.`);
}

export function spawnProjexCommand(command, args, options = {}) {
  const env = { ...process.env, ...(options.env ?? {}) };
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env,
    stdio: options.stdio ?? 'inherit',
  });
  return child;
}

export async function stopChildProcess(child, signal = 'SIGTERM') {
  if (!child || child.exitCode != null) return;

  child.kill(signal);
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(() => {
      if (child.exitCode == null) {
        child.kill('SIGKILL');
      }
    }, 5_000).unref?.();
  });
}
