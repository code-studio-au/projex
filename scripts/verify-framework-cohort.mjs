import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

const DEFAULT_PATHS = {
  cohort: 'config/framework-dependency-cohort.json',
  lockfile: 'pnpm-lock.yaml',
  packageJson: 'package.json',
  serverFunctions: 'src/server/start/functions',
  workspace: 'pnpm-workspace.yaml',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function packageGlobMatches(pattern, packageName) {
  const versionSeparator = pattern.startsWith('@')
    ? pattern.indexOf('@', 1)
    : pattern.indexOf('@');
  const packagePattern =
    versionSeparator === -1 ? pattern : pattern.slice(0, versionSeparator);
  const matcher = new RegExp(
    `^${packagePattern.split('*').map(escapeRegExp).join('.*')}$`,
    'u'
  );
  return matcher.test(packageName);
}

function readWorkspacePolicy(workspaceConfig) {
  let parsed;
  try {
    parsed = parseYaml(workspaceConfig);
  } catch {
    throw new Error('pnpm-workspace.yaml must contain valid YAML.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('pnpm-workspace.yaml must contain a YAML mapping.');
  }

  const exclusions = parsed.minimumReleaseAgeExclude ?? [];
  if (
    !Array.isArray(exclusions) ||
    exclusions.some((entry) => typeof entry !== 'string')
  ) {
    throw new Error(
      'pnpm minimumReleaseAgeExclude must be a list of package selectors.'
    );
  }

  return {
    minimumReleaseAge: parsed.minimumReleaseAge,
    minimumReleaseAgeStrict: parsed.minimumReleaseAgeStrict,
    minimumReleaseAgeExclude: exclusions,
  };
}

function findImporterEntry(lockfile, packageName) {
  const importerEnd = lockfile.indexOf('\npackages:\n');
  if (importerEnd < 0) {
    throw new Error('pnpm-lock.yaml is missing its packages section.');
  }
  const importer = lockfile.slice(0, importerEnd);
  const packagePattern = escapeRegExp(packageName);
  const match = importer.match(
    new RegExp(
      `^      ['"]?${packagePattern}['"]?:\\n` +
        `        specifier: ([^\\n]+)\\n` +
        `        version: ([^\\n]+)$`,
      'mu'
    )
  );
  if (!match) {
    throw new Error(
      `pnpm-lock.yaml is missing the root importer entry for ${packageName}.`
    );
  }
  return { specifier: match[1], version: match[2] };
}

function findPackageVersions(lockfile, packageName) {
  const packagesStart = lockfile.indexOf('\npackages:\n');
  const snapshotsStart = lockfile.indexOf('\nsnapshots:\n');
  if (packagesStart < 0 || snapshotsStart < packagesStart) {
    throw new Error(
      'pnpm-lock.yaml must contain ordered packages and snapshots sections.'
    );
  }
  const packages = lockfile.slice(packagesStart, snapshotsStart);
  const versions = [];
  const pattern = new RegExp(
    `^  ['"]?${escapeRegExp(packageName)}@([^:'"\\s]+)['"]?:$`,
    'gmu'
  );
  for (const match of packages.matchAll(pattern)) {
    versions.push(match[1]);
  }
  return versions;
}

export function verifyFrameworkCohort({
  cohort,
  lockfile,
  packageJson,
  workspaceConfig,
}) {
  if (cohort.schemaVersion !== 1) {
    throw new Error('Unsupported framework cohort schema version.');
  }
  if (
    !Number.isInteger(cohort.minimumReleaseAgeMinutes) ||
    cohort.minimumReleaseAgeMinutes < 1
  ) {
    throw new Error(
      'The framework cohort must require a positive release-age delay.'
    );
  }

  const selectedAt = Date.parse(cohort.selectedAt);
  if (!Number.isFinite(selectedAt)) {
    throw new Error('The framework cohort selectedAt value must be ISO-8601.');
  }

  const workspacePolicy = readWorkspacePolicy(workspaceConfig);
  const configuredReleaseAge = workspacePolicy.minimumReleaseAge;
  if (
    !Number.isInteger(configuredReleaseAge) ||
    configuredReleaseAge < cohort.minimumReleaseAgeMinutes
  ) {
    throw new Error(
      `pnpm minimumReleaseAge must be at least ${cohort.minimumReleaseAgeMinutes} minutes.`
    );
  }
  if (workspacePolicy.minimumReleaseAgeStrict !== true) {
    throw new Error('pnpm minimumReleaseAgeStrict must remain enabled.');
  }

  const exclusions = workspacePolicy.minimumReleaseAgeExclude;
  const cohortPackageNames = new Set([
    ...Object.keys(cohort.directPackages),
    ...Object.keys(cohort.singleVersionResolutions),
  ]);
  for (const packageName of cohortPackageNames) {
    if (
      exclusions.some((pattern) => packageGlobMatches(pattern, packageName))
    ) {
      throw new Error(
        `${packageName} must not bypass the pnpm release-age quarantine.`
      );
    }
  }

  for (const [packageName, expected] of Object.entries(cohort.directPackages)) {
    const actualSpecifier = packageJson[expected.section]?.[packageName];
    if (actualSpecifier !== expected.specifier) {
      throw new Error(
        `${packageName} must be exact-pinned to ${expected.specifier} in ${expected.section}.`
      );
    }

    const publishedAt = Date.parse(expected.publishedAt);
    const ageMinutes = (selectedAt - publishedAt) / 60_000;
    if (
      !Number.isFinite(publishedAt) ||
      ageMinutes < cohort.minimumReleaseAgeMinutes
    ) {
      throw new Error(
        `${packageName}@${expected.specifier} had not passed the configured release-age delay when selected.`
      );
    }

    const importerEntry = findImporterEntry(lockfile, packageName);
    if (importerEntry.specifier !== expected.specifier) {
      throw new Error(
        `pnpm-lock.yaml must pin ${packageName} with specifier ${expected.specifier}.`
      );
    }
    if (
      importerEntry.version !== expected.lockVersion &&
      !importerEntry.version.startsWith(`${expected.lockVersion}(`)
    ) {
      throw new Error(
        `pnpm-lock.yaml resolved ${packageName} to ${importerEntry.version}, expected ${expected.lockVersion}.`
      );
    }
  }

  for (const [packageName, expectedVersion] of Object.entries(
    cohort.singleVersionResolutions
  )) {
    const versions = findPackageVersions(lockfile, packageName);
    if (versions.length !== 1 || versions[0] !== expectedVersion) {
      throw new Error(
        `${packageName} must resolve once at ${expectedVersion}; found ${versions.join(', ') || 'none'}.`
      );
    }
  }
}

export function verifyFrameworkApiUsage(sources) {
  for (const { path, source } of sources) {
    if (source.includes('.inputValidator(')) {
      throw new Error(
        `${path} must use createServerFn().validator(), not the deprecated inputValidator() API.`
      );
    }
  }
}

async function runCli() {
  const [
    cohortSource,
    packageSource,
    lockfile,
    workspaceConfig,
    functionFiles,
  ] = await Promise.all([
    readFile(DEFAULT_PATHS.cohort, 'utf8'),
    readFile(DEFAULT_PATHS.packageJson, 'utf8'),
    readFile(DEFAULT_PATHS.lockfile, 'utf8'),
    readFile(DEFAULT_PATHS.workspace, 'utf8'),
    readdir(DEFAULT_PATHS.serverFunctions),
  ]);
  const frameworkSources = await Promise.all(
    functionFiles
      .filter((file) => file.endsWith('.ts'))
      .map(async (file) => ({
        path: `${DEFAULT_PATHS.serverFunctions}/${file}`,
        source: await readFile(
          `${DEFAULT_PATHS.serverFunctions}/${file}`,
          'utf8'
        ),
      }))
  );
  verifyFrameworkCohort({
    cohort: JSON.parse(cohortSource),
    lockfile,
    packageJson: JSON.parse(packageSource),
    workspaceConfig,
  });
  verifyFrameworkApiUsage(frameworkSources);
  process.stdout.write('Framework dependency cohort checks passed.\n');
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  runCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
