import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompiledQuery } from 'kysely';
import type { Migration } from 'kysely/migration';

const sqlFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '0013_txn_reversals.sql'
);

const migration: Migration = {
  async up(db) {
    const sqlText = await readFile(sqlFilePath, 'utf8');
    await db.executeQuery(CompiledQuery.raw(sqlText));
  },
};

export default migration;
