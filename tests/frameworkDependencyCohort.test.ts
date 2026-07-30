import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import {
  type FrameworkCohort,
  verifyFrameworkApiUsage,
  verifyFrameworkCohort,
} from '../scripts/verify-framework-cohort.mjs';

async function readRepositoryInputs() {
  const [cohortSource, packageSource, lockfile, workspaceConfig] =
    await Promise.all([
      readFile('config/framework-dependency-cohort.json', 'utf8'),
      readFile('package.json', 'utf8'),
      readFile('pnpm-lock.yaml', 'utf8'),
      readFile('pnpm-workspace.yaml', 'utf8'),
    ]);

  return {
    cohort: JSON.parse(cohortSource) as FrameworkCohort,
    lockfile,
    packageJson: JSON.parse(packageSource) as Record<
      string,
      Record<string, string>
    >,
    workspaceConfig,
  };
}

async function readFrameworkSources() {
  const directory = 'src/server/start/functions';
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith('.ts')
  );
  return Promise.all(
    files.map(async (file) => ({
      path: `${directory}/${file}`,
      source: await readFile(`${directory}/${file}`, 'utf8'),
    }))
  );
}

describe('framework dependency cohort', () => {
  test('accepts the exact release-age-eligible repository cohort', async () => {
    const inputs = await readRepositoryInputs();

    expect(() => verifyFrameworkCohort(inputs)).not.toThrow();
  });

  test('rejects an independently moving direct dependency range', async () => {
    const inputs = await readRepositoryInputs();
    inputs.packageJson.dependencies['@tanstack/react-start'] = '^1.168.32';

    expect(() => verifyFrameworkCohort(inputs)).toThrow(
      '@tanstack/react-start must be exact-pinned to 1.168.32'
    );
  });

  test('rejects package and root lockfile importer disagreement', async () => {
    const inputs = await readRepositoryInputs();
    inputs.lockfile = inputs.lockfile.replace(
      'specifier: 1.168.32',
      'specifier: ^1.168.32'
    );

    expect(() => verifyFrameworkCohort(inputs)).toThrow(
      'pnpm-lock.yaml must pin @tanstack/react-start with specifier 1.168.32'
    );
  });

  test('rejects a lockfile that resolves a second framework version', async () => {
    const inputs = await readRepositoryInputs();
    inputs.lockfile = inputs.lockfile.replace(
      '\nsnapshots:\n',
      "\n  '@tanstack/router-core@1.171.14':\n    resolution: {}\n\nsnapshots:\n"
    );

    expect(() => verifyFrameworkCohort(inputs)).toThrow(
      '@tanstack/router-core must resolve once at 1.171.15'
    );
  });

  test('rejects a missing expected framework resolution', async () => {
    const inputs = await readRepositoryInputs();
    inputs.lockfile = inputs.lockfile.replace(
      "\n  '@tanstack/start-fn-stubs@1.162.0':",
      "\n  '@tanstack/start-fn-stubs@1.162.1':"
    );

    expect(() => verifyFrameworkCohort(inputs)).toThrow(
      '@tanstack/start-fn-stubs must resolve once at 1.162.0; found 1.162.1'
    );
  });

  test('rejects a cohort selected before its release-age quarantine elapsed', async () => {
    const inputs = await readRepositoryInputs();
    inputs.cohort = structuredClone(inputs.cohort);
    inputs.cohort.directPackages['@tanstack/react-start'].publishedAt =
      inputs.cohort.selectedAt;

    expect(() => verifyFrameworkCohort(inputs)).toThrow(
      '@tanstack/react-start@1.168.32 had not passed the configured release-age delay'
    );
  });

  test('rejects missing or weakened strict release-age policy', async () => {
    const missingAge = await readRepositoryInputs();
    missingAge.workspaceConfig = missingAge.workspaceConfig.replace(
      'minimumReleaseAge: 10080',
      'minimumReleaseAge: invalid'
    );

    expect(() => verifyFrameworkCohort(missingAge)).toThrow(
      'pnpm minimumReleaseAge must be at least 10080 minutes'
    );

    const nonStrict = await readRepositoryInputs();
    nonStrict.workspaceConfig = nonStrict.workspaceConfig.replace(
      'minimumReleaseAgeStrict: true',
      'minimumReleaseAgeStrict: false'
    );

    expect(() => verifyFrameworkCohort(nonStrict)).toThrow(
      'pnpm minimumReleaseAgeStrict must remain enabled'
    );
  });

  test('rejects release-age exclusions covering a cohort package', async () => {
    const inputs = await readRepositoryInputs();
    inputs.workspaceConfig = inputs.workspaceConfig.replace(
      "  - '@types/*'",
      "  - '@types/*'\n  - '@tanstack/*'"
    );

    expect(() => verifyFrameworkCohort(inputs)).toThrow(
      '@tanstack/react-router must not bypass the pnpm release-age quarantine'
    );

    const versionQualified = await readRepositoryInputs();
    versionQualified.workspaceConfig = versionQualified.workspaceConfig.replace(
      "  - '@types/*'",
      "  - '@types/*'\n  - 'h3@2.0.1-rc.20'"
    );

    expect(() => verifyFrameworkCohort(versionQualified)).toThrow(
      'h3 must not bypass the pnpm release-age quarantine'
    );
  });

  test('rejects the deprecated TanStack server-function validator API', async () => {
    const frameworkSources = await readFrameworkSources();

    expect(() =>
      verifyFrameworkApiUsage([
        {
          path: 'src/server/start/functions/example.ts',
          source: 'createServerFn().inputValidator(schema).handler(handler)',
        },
      ])
    ).toThrow(
      'must use createServerFn().validator(), not the deprecated inputValidator() API'
    );

    expect(() => verifyFrameworkApiUsage(frameworkSources)).not.toThrow();
  });
});
