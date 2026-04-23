declare module 'pg' {
  export type QueryResultRow = Record<string, unknown>;

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    command: 'UPDATE' | 'DELETE' | 'INSERT' | 'SELECT' | 'MERGE';
    rowCount: number;
    rows: R[];
  }

  export interface PoolConfig {
    connectionString?: string;
  }

  export interface PoolClient {
    query<R = QueryResultRow>(
      sql: string,
      params?: readonly unknown[]
    ): Promise<QueryResult<R extends QueryResultRow ? R : QueryResultRow>>;
    query<R>(cursor: Cursor<R>): Cursor<R>;
    release(): void;
  }

  export interface Cursor<T> {
    read(rowsCount: number): Promise<T[]>;
    close(): Promise<void>;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<R extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: readonly unknown[]
    ): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
