import { spawn } from 'node:child_process';
import path from 'node:path';

import { requireDatabaseUrl } from '../src/server/env.ts';
import { loadEnvFiles } from '../src/server/envFiles.ts';

function resolveCodegenBin() {
  const binName =
    process.platform === 'win32' ? 'kysely-codegen.cmd' : 'kysely-codegen';
  return path.resolve(process.cwd(), 'node_modules', '.bin', binName);
}

async function run() {
  loadEnvFiles();

  const args = [
    '--config-file',
    path.resolve(process.cwd(), '.kysely-codegenrc.json'),
    '--url',
    requireDatabaseUrl(),
  ];

  if (process.argv.includes('--verify')) {
    args.push('--verify');
  }

  const child = spawn(resolveCodegenBin(), args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal == null
            ? `kysely-codegen exited with code ${code ?? 'unknown'}`
            : `kysely-codegen exited from signal ${signal}`
        )
      );
    });
  });
}

await run();
