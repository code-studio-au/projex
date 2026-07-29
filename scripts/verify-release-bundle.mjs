#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function requireIdentifier(label, value) {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9][a-z0-9.-]{0,127}$/u.test(value)
  ) {
    fail(`${label} is not a valid release identifier.`);
  }
  return value;
}

function requirePositiveInteger(label, value) {
  const stringValue = requireIdentifier(label, value);
  if (!/^[1-9][0-9]*$/u.test(stringValue)) {
    fail(`${label} must be a positive integer.`);
  }
  return stringValue;
}

const bundleDirectory = resolve(process.argv[2] ?? 'artifacts');
const entries = (await readdir(bundleDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const artifacts = entries.filter((entry) =>
  /^projex-(?:verified|recovery)-[0-9a-f]{12}-run[1-9][0-9]*-attempt[1-9][0-9]*\.tar\.gz$/u.test(
    entry
  )
);

if (artifacts.length !== 1) {
  fail('Release bundle must contain exactly one Projex deploy artifact.');
}

const artifactName = artifacts[0];
const artifactPath = resolve(bundleDirectory, artifactName);
const releaseId = artifactName.slice('projex-'.length, -'.tar.gz'.length);
const checksumName = `${artifactName}.sha256`;
const sbomName = `${artifactName.slice(0, -'.tar.gz'.length)}.sbom.spdx.json`;
const expectedEntries = new Set([artifactName, checksumName, sbomName]);
const unexpectedEntries = entries.filter(
  (entry) => !expectedEntries.has(entry)
);
if (
  entries.length !== expectedEntries.size ||
  unexpectedEntries.length > 0 ||
  !entries.includes(checksumName) ||
  !entries.includes(sbomName)
) {
  fail(
    'Release bundle must contain only the artifact, its SHA-256 file, and its SPDX SBOM.'
  );
}

const artifact = await readFile(artifactPath);
const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
const checksum = await readFile(resolve(bundleDirectory, checksumName), 'utf8');
if (checksum !== `${artifactSha256}  ${artifactName}\n`) {
  fail('Release bundle checksum file does not match the deploy artifact.');
}

let sbom;
try {
  sbom = JSON.parse(await readFile(resolve(bundleDirectory, sbomName), 'utf8'));
} catch {
  fail('Release bundle SBOM must be valid JSON.');
}
if (
  sbom?.spdxVersion !== 'SPDX-2.3' ||
  !Array.isArray(sbom?.packages) ||
  sbom.packages.length === 0
) {
  fail('Release bundle must include a non-empty SPDX 2.3 SBOM.');
}

const manifestResult = spawnSync(
  'tar',
  ['-xOzf', artifactPath, '.projex-release.json'],
  {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  }
);
if (manifestResult.status !== 0) {
  fail(
    `Unable to read the release manifest from ${basename(artifactPath)}: ${manifestResult.stderr.trim()}`
  );
}

let manifest;
try {
  manifest = JSON.parse(manifestResult.stdout);
} catch {
  fail('Deploy artifact release manifest must be valid JSON.');
}

if (manifest?.schemaVersion !== 2) {
  fail(
    `Unsupported deploy manifest schema: ${String(manifest?.schemaVersion)}`
  );
}
if (
  requireIdentifier('Manifest release ID', manifest.releaseId) !== releaseId
) {
  fail('Deploy manifest release ID does not match the artifact name.');
}
if (
  typeof manifest.gitSha !== 'string' ||
  !/^[0-9a-f]{40}$/u.test(manifest.gitSha)
) {
  fail('Deploy manifest Git SHA must be a full lowercase SHA-1 object ID.');
}
if (manifest.buildWorkflow !== 'release') {
  fail('Deploy manifest build workflow must be release.');
}
if (manifest.buildMode !== 'verified' && manifest.buildMode !== 'recovery') {
  fail('Deploy manifest build mode must be verified or recovery.');
}
const buildRunId = requirePositiveInteger(
  'Manifest build run ID',
  manifest.buildRunId
);
const buildRunAttempt = requirePositiveInteger(
  'Manifest build run attempt',
  manifest.buildRunAttempt
);
const expectedReleaseId = `${manifest.buildMode}-${manifest.gitSha.slice(
  0,
  12
)}-run${buildRunId}-attempt${buildRunAttempt}`;
if (releaseId !== expectedReleaseId) {
  fail('Deploy manifest fields do not reproduce the immutable release ID.');
}

const output = {
  artifact_name: artifactName,
  artifact_path: artifactPath,
  artifact_sha256: artifactSha256,
  sbom_path: resolve(bundleDirectory, sbomName),
  release_id: releaseId,
  git_sha: manifest.gitSha,
  build_mode: manifest.buildMode,
  build_run_id: buildRunId,
  build_run_attempt: buildRunAttempt,
};

if (process.env.GITHUB_OUTPUT) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(output)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
