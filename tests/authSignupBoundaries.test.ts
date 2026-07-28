import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { test } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const trustedProvisioningPath = 'server/auth/betterAuthInstance.ts';

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    })
  );

  return files.flat();
}

test('credential sign-up is confined to trusted auth provisioning', async () => {
  const signUpCallSites: string[] = [];

  for (const path of await collectSourceFiles(sourceRoot)) {
    const source = await readFile(path, 'utf8');
    if (!/\.signUpEmail\s*\(/.test(source)) continue;
    signUpCallSites.push(relative(sourceRoot, path));
  }

  assert.deepEqual(signUpCallSites, [trustedProvisioningPath]);
});
