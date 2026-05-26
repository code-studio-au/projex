import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';

import { requireDatabaseUrl } from '../env.ts';
import { loadEnvFiles } from '../envFiles.ts';
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

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1] ?? '';

    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += char + next;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      current += char + next;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      current += char;
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      current += char;
      inDoubleQuote = true;
      continue;
    }

    if (char === '$') {
      const rest = sql.slice(index);
      const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarQuoteTag = match[0];
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        continue;
      }
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function run() {
  loadEnvFiles();

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
        await pool.query('insert into schema_migrations(id) values ($1)', [
          file,
        ]);
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

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
