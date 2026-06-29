import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type CreateDatabaseExecArgsOptions = {
  user: string;
  password: string;
  database: string;
};

type DisposablePostgresModule = {
  buildCreateDatabaseExecArgs: (
    options: CreateDatabaseExecArgsOptions
  ) => string[];
};

const { buildCreateDatabaseExecArgs } = require(
  '../../scripts/disposable-postgres.mjs'
) as DisposablePostgresModule;

export { buildCreateDatabaseExecArgs };
