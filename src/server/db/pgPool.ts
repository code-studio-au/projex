import pg from 'pg';
import pgTypes from 'pg-types';

type PgCommand = 'UPDATE' | 'DELETE' | 'INSERT' | 'SELECT' | 'MERGE';

export type TypedPgQueryResult<R> = {
  command: PgCommand;
  rowCount: number;
  rows: R[];
};

export type TypedPgCursor<T> = {
  read(rowsCount: number): Promise<T[]>;
  close(): Promise<void>;
};

export type TypedPgPoolClient = {
  query<R>(
    sql: string,
    parameters: ReadonlyArray<unknown>
  ): Promise<TypedPgQueryResult<R>>;
  query<R>(cursor: TypedPgCursor<R>): TypedPgCursor<R>;
  release(): void;
};

export type TypedPgPool = {
  Client?: new (options: unknown) => {
    connect(): Promise<unknown>;
    end(): void;
    processID?: number;
    query<R>(
      sql: string,
      parameters: ReadonlyArray<unknown>
    ): Promise<TypedPgQueryResult<R>>;
    query<R>(cursor: TypedPgCursor<R>): TypedPgCursor<R>;
  };
  connect(): Promise<TypedPgPoolClient>;
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<TypedPgQueryResult<R>>;
  end(): Promise<void>;
  options: object;
};

type PgModule = {
  Pool: new (config: PgPoolConfig) => TypedPgPool;
};

type PgPoolSslConfig = false | { rejectUnauthorized: boolean };

type PgPoolConfig = {
  connectionString: string;
  ssl?: PgPoolSslConfig;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
};

const { Pool } = pg as PgModule;

const PG_DATE_OID = 1082;
let dateParserConfigured = false;

function configureDateOnlyParser() {
  if (dateParserConfigured) return;
  // Keep Postgres DATE values as YYYY-MM-DD strings. Converting date-only
  // values through JavaScript Date applies timezone offsets and can shift
  // transaction dates when rows are updated and read back.
  pgTypes.setTypeParser(PG_DATE_OID, (value: string) => value);
  dateParserConfigured = true;
}

function parsePositiveIntEnv(
  key: 'PG_POOL_MAX' | 'PG_IDLE_TIMEOUT_MS' | 'PG_CONNECTION_TIMEOUT_MS',
  fallback: number
): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pgSslConfig(): PgPoolSslConfig | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;

  const mode = (process.env.PG_SSL_MODE ?? 'require').trim().toLowerCase();
  if (mode === 'disable' || mode === 'allow' || mode === 'prefer') {
    return false;
  }

  if (mode === 'no-verify') {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
}

export function createPgPool(connectionString: string): TypedPgPool {
  configureDateOnlyParser();
  return new Pool({
    connectionString,
    ssl: pgSslConfig(),
    max: parsePositiveIntEnv('PG_POOL_MAX', 10),
    idleTimeoutMillis: parsePositiveIntEnv('PG_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: parsePositiveIntEnv(
      'PG_CONNECTION_TIMEOUT_MS',
      5_000
    ),
  });
}
