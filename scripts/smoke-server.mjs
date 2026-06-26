import { spawn } from 'node:child_process';
import { logNodeRuntime, resolveNodeExecutable } from './node-runtime.mjs';

logNodeRuntime('smoke-server launcher');

const child = spawn(
  resolveNodeExecutable(),
  ['--import', 'tsx', 'src/server/smoke/cli.ts', ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
