import { spawn } from 'node:child_process';
import { parseCliArgs } from './cli-args.mjs';
import { logNodeRuntime } from './node-runtime.mjs';

logNodeRuntime('smoke-browser launcher');

const cliArgs = parseCliArgs(process.argv.slice(2), {
  booleanFlags: ['--sweep-stale-fixtures', '--use-generated-fixtures'],
  valueOptions: ['--section'],
});
const requestedSections = cliArgs.getValues('--section');
if (requestedSections.some((section) => section !== 'basics')) {
  throw new Error('Browser smoke currently supports only the basics section.');
}

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'playwright',
    'test',
    '--config=playwright.config.ts',
    ...cliArgs.passthrough,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROJEX_SMOKE_SWEEP_STALE: cliArgs.flags.has('--sweep-stale-fixtures')
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
