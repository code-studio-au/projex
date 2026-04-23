import { Pool } from 'pg';

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

export function createPgPool(connectionString: string): TypedPgPool {
  // `pg` does not ship the runtime types we want to enforce across the repo here,
  // so we isolate the boundary in one place and keep the rest of the codebase typed.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const pool = new Pool({ connectionString });
  return pool as TypedPgPool;
}
