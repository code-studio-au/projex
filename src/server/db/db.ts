import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './schema';
import { requireDatabaseUrl, validateServerStartupEnv } from '../env.ts';

let _db: Kysely<DB> | null = null;

/**
 * Create (or reuse) a Kysely instance.
 *
 * In TanStack Start you can create this once per server process.
 */
export function getDb(): Kysely<DB> {
  if (_db) return _db;

  validateServerStartupEnv();
  const connectionString = requireDatabaseUrl();

  const pool = new Pool({ connectionString });

  _db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });

  return _db;
}
