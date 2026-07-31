import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { createPgPool } from '../src/server/db/pgPool.ts';

const CONNECTION_STRING = 'postgres://projex:projex@localhost:5432/projex';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createPgPool TLS configuration', () => {
  test('leaves TLS unspecified for local development by default', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PG_SSL_MODE', '');
    vi.stubEnv('PG_SSL_CA_FILE', '');

    const pool = createPgPool(CONNECTION_STRING);
    expect(pool.options).toMatchObject({
      ssl: undefined,
      allowExitOnIdle: false,
    });
    await pool.end();
  });

  test('allows short-lived commands to exit when all clients are idle', async () => {
    vi.stubEnv('PG_ALLOW_EXIT_ON_IDLE', 'true');

    const pool = createPgPool(CONNECTION_STRING);
    expect(pool.options).toMatchObject({ allowExitOnIdle: true });
    await pool.end();
  });

  test('requires certificate verification in production by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PG_SSL_MODE', '');
    vi.stubEnv('PG_SSL_CA_FILE', '');

    const pool = createPgPool(CONNECTION_STRING);
    expect(pool.options).toMatchObject({
      ssl: { rejectUnauthorized: true },
    });
    await pool.end();
  });

  test('trusts an explicitly configured private CA outside production', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'projex-pg-ca-test-'));
    const caFile = join(tempDirectory, 'ca.crt');
    await writeFile(caFile, 'test private CA certificate');

    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PG_SSL_MODE', 'require');
    vi.stubEnv('PG_SSL_CA_FILE', caFile);

    try {
      const pool = createPgPool(CONNECTION_STRING);
      expect(pool.options).toMatchObject({
        ssl: {
          ca: 'test private CA certificate',
          rejectUnauthorized: true,
        },
      });
      await pool.end();
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  test('supports deliberate TLS verification and plaintext exceptions', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PG_SSL_MODE', 'no-verify');

    const unverifiedPool = createPgPool(CONNECTION_STRING);
    expect(unverifiedPool.options).toMatchObject({
      ssl: { rejectUnauthorized: false },
    });
    await unverifiedPool.end();

    vi.stubEnv('PG_SSL_MODE', 'disable');
    const plaintextPool = createPgPool(CONNECTION_STRING);
    expect(plaintextPool.options).toMatchObject({ ssl: false });
    await plaintextPool.end();
  });
});
