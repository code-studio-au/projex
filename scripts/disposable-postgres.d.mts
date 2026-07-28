export type CreateDatabaseExecArgsOptions = {
  user: string;
  password: string;
  database: string;
};

export declare function buildCreateDatabaseExecArgs(
  options: CreateDatabaseExecArgsOptions
): string[];

export type DisposablePostgresRunArgsOptions = {
  containerName: string;
  image: string;
  password: string;
  tlsDirectory?: string;
  user: string;
};

export declare function buildDisposablePostgresRunArgs(
  options: DisposablePostgresRunArgsOptions
): string[];
