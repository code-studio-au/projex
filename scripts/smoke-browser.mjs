import { spawn } from 'node:child_process';
import { logNodeRuntime } from './node-runtime.mjs';

logNodeRuntime('smoke-browser launcher');

const argv = process.argv.slice(2);
const requestedSections = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === '--section') {
    const section = argv[index + 1];
    if (!section) throw new Error('Missing value after --section.');
    requestedSections.push(section);
    index += 1;
  } else if (arg.startsWith('--section=')) {
    requestedSections.push(arg.slice('--section='.length));
  }
}
if (requestedSections.some((section) => section !== 'basics')) {
  throw new Error('Browser smoke currently supports only the basics section.');
}

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'playwright', 'test', '--config=playwright.config.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROJEX_SMOKE_SWEEP_STALE: argv.includes('--sweep-stale-fixtures')
        ? 'true'
        : process.env.PROJEX_SMOKE_SWEEP_STALE,
    },
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
