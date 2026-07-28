import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Kysely } from 'kysely';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SqlFileMigrationProvider } from '../src/server/db/sqlFileMigrationProvider.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('SQL file migration provider', () => {
  test('loads only ordered SQL files and preserves their migration names', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'projex-sql-migrations-')
    );
    temporaryDirectories.push(directory);
    await Promise.all([
      writeFile(path.join(directory, '0002_second.sql'), 'select 2;'),
      writeFile(path.join(directory, '0001_first.sql'), 'select 1;'),
      writeFile(path.join(directory, 'README.md'), 'not a migration'),
    ]);

    const migrations = await new SqlFileMigrationProvider(
      directory
    ).getMigrations();

    expect(Object.keys(migrations)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
  });

  test('executes the selected SQL file as one compiled query', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'projex-sql-migrations-')
    );
    temporaryDirectories.push(directory);
    await writeFile(
      path.join(directory, '0001_first.sql'),
      'create table example (id integer);'
    );
    const migrations = await new SqlFileMigrationProvider(
      directory
    ).getMigrations();
    const executeQuery = vi.fn().mockResolvedValue(undefined);
    const db = { executeQuery } as unknown as Kysely<Record<string, never>>;

    await migrations['0001_first.sql']?.up(db);

    expect(executeQuery).toHaveBeenCalledOnce();
    expect(executeQuery.mock.calls[0]?.[0]).toMatchObject({
      sql: 'create table example (id integer);',
      parameters: [],
    });
  });
});
