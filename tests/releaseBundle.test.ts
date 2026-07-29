import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verifier = join(repoRoot, 'scripts/verify-release-bundle.mjs');
const temporaryRoots: string[] = [];
const gitSha = 'a'.repeat(40);

async function createBundle(
  overrides: {
    buildMode?: string;
    checksum?: string;
    includeSbom?: boolean;
    manifestReleaseId?: string;
    sbom?: unknown;
  } = {}
) {
  const root = await mkdtemp(join(tmpdir(), 'projex-release-bundle-'));
  temporaryRoots.push(root);
  const bundleDirectory = join(root, 'bundle');
  const payloadDirectory = join(root, 'payload');
  await mkdir(bundleDirectory);
  await mkdir(payloadDirectory);

  const buildMode = overrides.buildMode ?? 'verified';
  const releaseId = `verified-${gitSha.slice(0, 12)}-run99-attempt2`;
  const artifactName = `projex-${releaseId}.tar.gz`;
  const artifactPath = join(bundleDirectory, artifactName);
  await writeFile(
    join(payloadDirectory, '.projex-release.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      releaseId: overrides.manifestReleaseId ?? releaseId,
      gitSha,
      buildWorkflow: 'release',
      buildMode,
      buildRunId: '99',
      buildRunAttempt: '2',
    })}\n`
  );
  const archive = spawnSync(
    'tar',
    ['-czf', artifactPath, '-C', payloadDirectory, '.projex-release.json'],
    { encoding: 'utf8' }
  );
  expect(archive.status, archive.stderr).toBe(0);

  const digest = createHash('sha256')
    .update(await readFile(artifactPath))
    .digest('hex');
  await writeFile(
    `${artifactPath}.sha256`,
    overrides.checksum ?? `${digest}  ${artifactName}\n`
  );
  if (overrides.includeSbom !== false) {
    await writeFile(
      join(bundleDirectory, `projex-${releaseId}.sbom.spdx.json`),
      `${JSON.stringify(
        overrides.sbom ?? {
          spdxVersion: 'SPDX-2.3',
          packages: [{ name: 'projex', versionInfo: '0.0.0' }],
        }
      )}\n`
    );
  }
  return { artifactName, bundleDirectory, digest, releaseId };
}

function verifyBundle(bundleDirectory: string) {
  const env = { ...process.env };
  delete env.GITHUB_OUTPUT;
  return spawnSync(process.execPath, [verifier, bundleDirectory], {
    encoding: 'utf8',
    env,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe('release bundle verification', () => {
  test('accepts one checksum-matched artifact with coherent provenance and SPDX SBOM', async () => {
    const bundle = await createBundle();
    const result = verifyBundle(bundle.bundleDirectory);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      artifact_name: bundle.artifactName,
      artifact_sha256: bundle.digest,
      build_mode: 'verified',
      build_run_attempt: '2',
      build_run_id: '99',
      git_sha: gitSha,
      release_id: bundle.releaseId,
    });
  });

  test('rejects a missing or malformed checksum and SBOM', async () => {
    const badChecksum = await createBundle({ checksum: `${'b'.repeat(64)} x` });
    expect(verifyBundle(badChecksum.bundleDirectory).stderr).toContain(
      'checksum file does not match'
    );

    const missingSbom = await createBundle({ includeSbom: false });
    expect(verifyBundle(missingSbom.bundleDirectory).stderr).toContain(
      'artifact, its SHA-256 file, and its SPDX SBOM'
    );

    const malformedSbom = await createBundle({
      sbom: { spdxVersion: 'SPDX-2.2', packages: [] },
    });
    expect(verifyBundle(malformedSbom.bundleDirectory).stderr).toContain(
      'non-empty SPDX 2.3 SBOM'
    );
  });

  test('rejects manifest identity drift from the retained artifact name', async () => {
    const bundle = await createBundle({
      manifestReleaseId: 'verified-bbbbbbbbbbbb-run99-attempt2',
    });
    const result = verifyBundle(bundle.bundleDirectory);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'release ID does not match the artifact name'
    );
  });
});
