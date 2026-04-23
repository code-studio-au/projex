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
  query<R>(sql: string, parameters: ReadonlyArray<unknown>): Promise<TypedPgQueryResult<R>>;
  query<R>(cursor: TypedPgCursor<R>): TypedPgCursor<R>;
  release(): void;
};

export type TypedPgPool = {
  connect(): Promise<TypedPgPoolClient>;
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<TypedPgQueryResult<R>>;
  end(): Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString: string }) => TypedPgPool;
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

export function createPgPool(connectionString: string): TypedPgPool {
  configureDateOnlyParser();
  return new Pool({ connectionString });
}
