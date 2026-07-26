import { describe, expect, test } from 'vitest';

import {
  buildCreateDatabaseExecArgs,
  buildDisposablePostgresRunArgs,
} from './helpers/disposablePostgres.ts';

describe('buildCreateDatabaseExecArgs', () => {
  test('uses explicit tcp transport and password auth for container-local create database', () => {
    const args = buildCreateDatabaseExecArgs({
      user: 'postgres',
      password: 'postgres',
      database: 'projex_integration_test',
    }) as string[];

    expect(args).toEqual([
      'exec',
      '-e',
      'PGPASSWORD=postgres',
      'PLACEHOLDER_CONTAINER',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      '127.0.0.1',
      '-p',
      '5432',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      'CREATE DATABASE "projex_integration_test"',
    ]);
  });

  test('quotes database identifiers safely', () => {
    const args = buildCreateDatabaseExecArgs({
      user: 'postgres',
      password: 'secret',
      database: 'projex"test',
    }) as string[];

    expect(args[args.length - 1]).toBe('CREATE DATABASE "projex""test"');
  });
});

describe('buildDisposablePostgresRunArgs', () => {
  test('starts the default disposable database without TLS overrides', () => {
    expect(
      buildDisposablePostgresRunArgs({
        containerName: 'projex-test-db',
        image: 'postgres:17-alpine',
        password: 'secret',
        user: 'postgres',
      })
    ).toEqual([
      'run',
      '-d',
      '--rm',
      '--name',
      'projex-test-db',
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_PASSWORD=secret',
      '-e',
      'POSTGRES_DB=postgres',
      '-p',
      '127.0.0.1::5432',
      'postgres:17-alpine',
    ]);
  });

  test('mounts temporary server credentials and requires PostgreSQL TLS', () => {
    const args = buildDisposablePostgresRunArgs({
      containerName: 'projex-smoke-db',
      image: 'postgres:17-alpine',
      password: 'secret',
      tlsDirectory: '/tmp/projex-postgres-tls',
      user: 'postgres',
    });

    expect(args).toEqual(
      expect.arrayContaining([
        '--mount',
        'type=bind,source=/tmp/projex-postgres-tls,target=/run/projex-postgres-tls,readonly',
        'postgres:17-alpine',
        'sh',
        '-ceu',
      ])
    );

    const bootstrapScript = args.at(-1);
    expect(bootstrapScript).toContain('chown postgres:postgres');
    expect(bootstrapScript).toContain('chmod 0600');
    expect(bootstrapScript).toContain('postgres -c ssl=on');
    expect(bootstrapScript).toContain(
      'ssl_cert_file=/var/lib/postgresql/server.crt'
    );
    expect(bootstrapScript).toContain(
      'ssl_key_file=/var/lib/postgresql/server.key'
    );
  });
});
