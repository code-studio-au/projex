import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';

import { requireDatabaseUrl } from '../env.ts';
import { buildBetterAuthOptions } from '../auth/betterAuthInstance.ts';
import { createPgPool, type TypedPgPool } from './pgPool.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

type MigrationQueryResultRow = { id: string };

type Queryable = Pick<TypedPgPool, 'query' | 'end'>;

async function ensureMigrationsTable(pool: Queryable) {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedMigrationIds(pool: Queryable): Promise<Set<string>> {
  const res = await pool.query<MigrationQueryResultRow>(
    'select id from schema_migrations order by id'
  );
  return new Set(res.rows.map((r) => r.id));
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function run() {
  const hasBetterAuthEnv =
    Boolean(process.env.BETTER_AUTH_SECRET?.trim()) &&
    Boolean(process.env.BETTER_AUTH_URL?.trim());

  if (hasBetterAuthEnv) {
    const { runMigrations } = await getMigrations(buildBetterAuthOptions());
    await runMigrations();
  } else {
    console.warn(
      '[db:migrate] Skipping BetterAuth migrations (set BETTER_AUTH_SECRET and BETTER_AUTH_URL to enable)'
    );
  }

  const connectionString = requireDatabaseUrl();

  const pool: Queryable = createPgPool(connectionString);
  try {
    await ensureMigrationsTable(pool);
    const applied = await appliedMigrationIds(pool);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = await readFile(fullPath, 'utf8');
      const statements = splitSqlStatements(sql);

      await pool.query('begin');
      try {
        for (const stmt of statements) {
          await pool.query(stmt);
        }
        await pool.query('insert into schema_migrations(id) values ($1)', [file]);
        await pool.query('commit');
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        await pool.query('rollback');
        throw err;
      }
    }
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
