import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type CreateDatabaseExecArgsOptions = {
  user: string;
  password: string;
  database: string;
};

type DisposablePostgresRunArgsOptions = {
  containerName: string;
  image: string;
  password: string;
  tlsDirectory?: string;
  user: string;
};

type DisposablePostgresModule = {
  buildCreateDatabaseExecArgs: (
    options: CreateDatabaseExecArgsOptions
  ) => string[];
  buildDisposablePostgresRunArgs: (
    options: DisposablePostgresRunArgsOptions
  ) => string[];
};

const { buildCreateDatabaseExecArgs, buildDisposablePostgresRunArgs } =
  require('../../scripts/disposable-postgres.mjs') as DisposablePostgresModule;

export { buildCreateDatabaseExecArgs, buildDisposablePostgresRunArgs };
