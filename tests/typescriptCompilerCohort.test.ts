import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function readPackageManifest(relativePath: string) {
  return JSON.parse(
    await readFile(path.resolve(root, relativePath), 'utf8')
  ) as {
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
}

describe('TypeScript compiler cohort', () => {
  it('keeps TypeScript 7 primary and TypeScript 6 available for API consumers', async () => {
    const manifest = await readPackageManifest('package.json');

    expect(manifest.devDependencies['@typescript/native']).toBe(
      'npm:typescript@7.0.2'
    );
    expect(manifest.devDependencies.typescript).toBe(
      'npm:@typescript/typescript6@6.0.2'
    );
    expect(manifest.scripts.typecheck).toBe(
      'pnpm run typecheck:ts7 && pnpm run typecheck:ts6'
    );
    expect(manifest.scripts['typecheck:ts7']).toBe('tsc -b --noemit');
    expect(manifest.scripts['typecheck:ts6']).toBe('tsc6 -b --noemit');
  });

  it('uses the same dual-compiler contract for CDK', async () => {
    const manifest = await readPackageManifest('deploy/cdk/package.json');

    expect(manifest.devDependencies['@typescript/native']).toBe(
      'npm:typescript@7.0.2'
    );
    expect(manifest.devDependencies.typescript).toBe(
      'npm:@typescript/typescript6@6.0.2'
    );
    expect(manifest.scripts.build).toBe(
      'tsc -p tsconfig.json && pnpm run typecheck:ts6'
    );
    expect(manifest.scripts['typecheck:ts6']).toBe(
      'tsc6 -p tsconfig.json --noEmit'
    );
  });
});
