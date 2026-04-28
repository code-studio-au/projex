import { spawn } from 'node:child_process';

const child = spawn(
  process.execPath,
  [
    '--experimental-strip-types',
    'src/server/smoke/cli.ts',
    ...process.argv.slice(2),
  ],
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
