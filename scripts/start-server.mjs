import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { serve } from 'h3-v2';

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
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (Number.isNaN(port)) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

const { default: server } = await import('../dist/server/server.js');

if (typeof server?.fetch !== 'function') {
  console.error('Built server entry does not expose a fetch handler.');
  process.exit(1);
}

console.info(`Starting Projex SSR server on http://${host}:${port}`);
serve(server, { hostname: host, port });
