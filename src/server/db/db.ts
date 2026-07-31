import { Kysely, PostgresDialect } from 'kysely';
import type { PostgresDialectConfig } from 'kysely';
import type { DB } from './schema';
import { createPgPool } from './pgPool.ts';
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
  const pool = createPgPool(connectionString);

  _db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: pool as unknown as PostgresDialectConfig['pool'],
    }),
  });

  return _db;
}

/**
 * Close the process-wide database singleton used by short-lived commands.
 * Application servers normally retain it for their complete process lifetime.
 */
export async function destroyDb(): Promise<void> {
  const db = _db;
  _db = null;
  await db?.destroy();
}
