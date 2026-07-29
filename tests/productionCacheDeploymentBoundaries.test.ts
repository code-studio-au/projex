import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nginxConfigPaths = [
  'deploy/nginx/projex.conf',
  'deploy/nginx/projex.bootstrap.conf',
  'deploy/nginx/projex.https.conf.template',
];

describe('production cache deployment boundaries', () => {
  test('keeps proxied cache ownership at Node across nginx variants', async () => {
    for (const relativePath of nginxConfigPaths) {
      const config = await readFile(join(repoRoot, relativePath), 'utf8');

      expect(config).toContain(
        'Proxied Cache-Control is owned by the Node response layer'
      );
      expect(config).toContain('proxy_pass http://127.0.0.1:3000;');
      expect(config).not.toMatch(
        /add_header\s+Cache-Control\s+"[^"]*immutable/i
      );
      expect(config).not.toContain('proxy_hide_header Cache-Control');
    }
  });

  test('packages and validates the policy module and Vite manifest', async () => {
    const createArtifact = await readFile(
      join(repoRoot, 'scripts/create-deploy-artifact.sh'),
      'utf8'
    );
    const activateArtifact = await readFile(
      join(repoRoot, 'scripts/deploy-artifact-ec2.sh'),
      'utf8'
    );

    for (const requiredPath of [
      'scripts/cache-policy.mjs',
      'dist/client/.vite/manifest.json',
    ]) {
      expect(createArtifact).toContain(`require_path "${requiredPath}"`);
      expect(activateArtifact).toContain(
        `require_file "$RELEASE_DIR/${requiredPath}"`
      );
    }
    expect(createArtifact).toMatch(/\n\s+scripts\/cache-policy\.mjs \\\n/);
    expect(createArtifact).toMatch(/\n\s+dist \\\n/);
  });
});
