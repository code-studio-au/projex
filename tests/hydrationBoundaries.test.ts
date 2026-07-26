import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { test } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const hydrationHookPath = 'hooks/useIsHydrated.ts';

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

test('hydration consumers use the shared hydration hook', async () => {
  const directConsumers: string[] = [];

  for (const path of await collectSourceFiles(sourceRoot)) {
    const source = await readFile(path, 'utf8');
    if (!source.includes('useSyncExternalStore')) continue;
    directConsumers.push(relative(sourceRoot, path));
  }

  assert.deepEqual(directConsumers, [hydrationHookPath]);
});
