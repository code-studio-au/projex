# Dead-code verification

`pnpm run verify:dead-code` runs Knip across the application, scripts, database
migrations, tests, nginx maintenance script, and CDK workspace. It is part of
both `verify:app` and `verify:precommit` so orphan files and accidental public
exports fail CI.

The configuration keeps four narrow exceptions that static analysis cannot
infer:

- `kysely-codegen` is launched from a computed `node_modules/.bin` path by
  `scripts/generate-db-types.ts`.
- CDK's `ts-node` loader is declared in `deploy/cdk/cdk.json`.
- the root CDK script delegates to the `deploy/cdk` workspace, and
  `scripts/run-smoke-disposable.mjs` invokes the system `openssl` binary.
- `buildCreateDatabaseExecArgs` is loaded through the typed dynamic-module
  adapter in `tests/helpers/disposablePostgres.ts`.

Add an exception only for a verified non-static entry point or dependency and
document the runtime reference here. Do not use broad file or directory ignores.
