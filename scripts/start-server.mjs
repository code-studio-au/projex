import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync('dist/server/server.js')) {
  console.error('Missing dist/server/server.js. Run `npm run build` first.');
  process.exit(1);
}

const runMigrations = process.env.PROJEX_RUN_MIGRATIONS !== 'false';
if (runMigrations) {
  run('npm', ['run', 'db:migrate']);
}

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ?? '3000';
run('npm', ['run', 'preview', '--', '--host', host, '--port', port]);
