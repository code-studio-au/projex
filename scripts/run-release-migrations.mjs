import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { loadEnvFile } from './env-file.mjs';

const [envFile, deployPath, pnpmBin] = process.argv.slice(2);
if (!envFile || !deployPath || !pnpmBin) {
  throw new Error(
    'Usage: run-release-migrations.mjs <env-file> <deploy-path> <pnpm-bin>'
  );
}

loadEnvFile(resolve(envFile));

const child = spawn(pnpmBin, ['run', 'db:migrate'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PATH: deployPath,
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
