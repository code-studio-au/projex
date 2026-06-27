import { describe, expect, test } from 'vitest';

import { buildCreateDatabaseExecArgs } from '../scripts/disposable-postgres.mjs';

describe('buildCreateDatabaseExecArgs', () => {
  test('uses explicit tcp transport and password auth for container-local create database', () => {
    const args = buildCreateDatabaseExecArgs({
      user: 'postgres',
      password: 'postgres',
      database: 'projex_integration_test',
    });

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
    });

    expect(args.at(-1)).toBe('CREATE DATABASE "projex""test"');
  });
});
