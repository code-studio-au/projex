import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';

const verifierPath = path.resolve('scripts/verify-client-bundle.mjs');
const temporaryDirectories: string[] = [];

type FixtureOptions = {
  companyPageContents?: string;
  companyMappedAsset?: string;
};

async function createBundleFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'projex-bundle-budget-'));
  temporaryDirectories.push(root);
  const clientAssetsDir = path.join(root, 'client-assets');
  const serverAssetsDir = path.join(root, 'server-assets');
  await Promise.all([
    mkdir(clientAssetsDir, { recursive: true }),
    mkdir(serverAssetsDir, { recursive: true }),
  ]);

  const manifest = {
    routes: {
      __root__: {
        children: ['/_authed'],
        css: ['/assets/root.css'],
        preloads: ['/assets/root.js'],
      },
      '/_authed': {
        children: ['/_authed/c/$companyId'],
        preloads: ['/assets/authed-route.js'],
      },
      '/_authed/c/$companyId': {
        children: [
          '/_authed/c/$companyId/',
          '/_authed/c/$companyId/p/$projectId',
        ],
        preloads: ['/assets/company-route.js'],
      },
      '/_authed/c/$companyId/': {
        preloads: ['/assets/company-dashboard-route.js'],
      },
      '/_authed/c/$companyId/p/$projectId': {
        preloads: ['/assets/project-workspace-route.js'],
      },
    },
  };

  const companyMappedAsset =
    options.companyMappedAsset ?? 'assets/company-page.js';
  const assets: Record<string, string> = {
    'root.js': 'import "./vendor.js"; export const root = true;',
    'root.css': ':root { color: black; }',
    'vendor.js': 'export const vendor = true;',
    'authed-route.js':
      'const d=(m.f||(m.f=["assets/authed-layout.js"])); export { d };',
    'authed-layout.js': 'export const authed = true;',
    'company-route.js': 'export const company = true;',
    'company-dashboard-route.js': `const d=(m.f||(m.f=["${companyMappedAsset}","assets/company.css"])); export { d };`,
    'company-page.js':
      options.companyPageContents ??
      'import "./company-shared.js"; export const dashboard = true;',
    'company-shared.js': 'export const companyShared = true;',
    'company.css': '.company { display: block; }',
    'project-workspace-route.js':
      'const d=(m.f||(m.f=["assets/project-page.js","assets/project.css"])); export { d };',
    'project-page.js':
      'import "./company-shared.js"; export const workspace = true;',
    'project.css': '.project { display: block; }',
  };

  await Promise.all([
    writeFile(
      path.join(serverAssetsDir, '_tanstack-start-manifest_v-test.js'),
      `export function tsrStartManifest() { return ${JSON.stringify(manifest)}; }`
    ),
    ...Object.entries(assets).map(([assetPath, contents]) =>
      writeFile(path.join(clientAssetsDir, assetPath), contents)
    ),
  ]);

  return { clientAssetsDir, serverAssetsDir };
}

function runVerifier(fixture: {
  clientAssetsDir: string;
  serverAssetsDir: string;
}) {
  return spawnSync(process.execPath, [verifierPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJEX_BUNDLE_CLIENT_ASSETS_DIR: fixture.clientAssetsDir,
      PROJEX_BUNDLE_SERVER_ASSETS_DIR: fixture.serverAssetsDir,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('client bundle budgets', () => {
  test('reports direct-load and post-root navigation payloads', async () => {
    const result = runVerifier(await createBundleFixture());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Root initial');
    expect(result.stdout).toContain('Company dashboard');
    expect(result.stdout).toContain('Project workspace');
    expect(result.stdout).toContain('Navigation beyond root');
    expect(result.stdout).toContain('Client bundle budgets passed.');
  });

  test('rejects unsafe generated dependency paths', async () => {
    const result = runVerifier(
      await createBundleFixture({
        companyMappedAsset: 'assets/../outside.js',
      })
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Unsafe Vite dependency map in company-dashboard-route.js entry'
    );
  });

  test('fails when an authenticated route exceeds its budget', async () => {
    const result = runVerifier(
      await createBundleFixture({
        companyPageContents: randomBytes(600 * 1024).toString('base64'),
      })
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Company dashboard first-load JS exceeds its budget'
    );
    expect(result.stderr).toContain(
      'Company dashboard navigation JS exceeds its budget'
    );
  });
});
