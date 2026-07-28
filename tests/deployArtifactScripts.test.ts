import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const createArtifactScript = join(
  repoRoot,
  'scripts/create-deploy-artifact.sh'
);
const deployWorkflow = join(repoRoot, '.github/workflows/deploy.yml');
const ssmDeployScript = join(repoRoot, 'scripts/deploy-artifact-ssm.sh');
const ec2DeployScript = join(repoRoot, 'scripts/deploy-artifact-ec2.sh');
const letsEncryptScript = join(
  repoRoot,
  'scripts/provision-letsencrypt-cert.sh'
);
const nginxTlsTemplate = join(
  repoRoot,
  'deploy/nginx/projex.https.conf.template'
);
const gitSha = 'a'.repeat(40);
const temporaryRoots: string[] = [];
const testDeployUser = 'projex-test-deploy';

type ReleaseIdentity = {
  environment: string;
  gitSha: string;
  releaseId: string;
  runAttempt: string;
  runId: string;
};

async function makeTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'projex-deploy-test-'));
  temporaryRoots.push(root);
  return root;
}

async function writeExecutable(path: string, content: string) {
  await writeFile(path, content);
  await chmod(path, 0o755);
}

async function createMockCommands(root: string) {
  const bin = join(root, 'bin');
  const pnpmLog = join(root, 'pnpm.log');
  const migrationMarker = join(root, 'migration-applied');
  const failMigrateFlag = join(root, 'fail-migrate');
  await mkdir(bin, { recursive: true });

  await writeExecutable(
    join(bin, 'aws'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${MOCK_AWS_FAIL:-}" == "1" ]]; then
  exit 42
fi
args=("$@")
destination="\${args[\${#args[@]}-1]}"
cp "$MOCK_ARTIFACT_SOURCE" "$destination"
`
  );

  await writeExecutable(
    join(bin, 'id'),
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  -u)
    printf '12345\\n'
    ;;
  -gn|-un)
    printf '%s\\n' ${JSON.stringify(testDeployUser)}
    ;;
  *)
    printf 'Unsupported mock id arguments: %s\\n' "$*" >&2
    exit 2
    ;;
esac
`
  );

  await writeExecutable(
    join(bin, 'pnpm'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\t%s\\n' "$(id -un)" "$*" >>${JSON.stringify(pnpmLog)}
if [[ -f ${JSON.stringify(failMigrateFlag)} && "$*" == "run db:migrate" ]]; then
  exit 17
fi
if [[ "$*" == "run db:migrate" ]]; then
  touch ${JSON.stringify(migrationMarker)}
fi
exit 0
`
  );

  await writeExecutable(
    join(bin, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'ok'
`
  );

  await writeExecutable(
    join(bin, 'sleep'),
    `#!/usr/bin/env bash
exit 0
`
  );

  await writeExecutable(
    join(bin, 'flock'),
    `#!/usr/bin/env bash
exit 0
`
  );

  await writeExecutable(
    join(bin, 'sudo'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${MOCK_SUDO_LOG:-}" ]]; then
  printf '%s\\n' "$*" >>"$MOCK_SUDO_LOG"
fi
if [[ "$1" == "--non-interactive" ]]; then
  shift
  [[ "$1" == "--user" ]]
  shift 2
  [[ "$1" == "--" ]]
  shift
  exec "$@"
fi
if [[ "$1" == "install" ]]; then
  if [[ " $* " == *" -d "* ]]; then
    destination_path="\${@: -1}"
    mkdir -p "$destination_path"
    exit 0
  fi
  args=("$@")
  source_path="\${args[\${#args[@]}-2]}"
  destination_path="\${args[\${#args[@]}-1]}"
  mkdir -p "$(dirname "$destination_path")"
  cp "$source_path" "$destination_path"
fi
exit 0
`
  );

  await writeExecutable(
    join(bin, 'systemd-analyze'),
    `#!/usr/bin/env bash
exit 0
`
  );

  return bin;
}

async function createArtifact(
  root: string,
  identity: ReleaseIdentity,
  name = identity.releaseId
) {
  const payload = join(root, `payload-${name}`);
  const artifactPath = join(root, `${name}.tar.gz`);
  await mkdir(join(payload, 'scripts'), { recursive: true });
  await writeFile(
    join(payload, '.projex-release.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        releaseId: identity.releaseId,
        gitSha: identity.gitSha,
        environment: identity.environment,
        runId: identity.runId,
        runAttempt: identity.runAttempt,
      },
      null,
      2
    )}\n`
  );
  await writeExecutable(
    join(payload, 'scripts/deploy-artifact-ec2.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${MOCK_RELEASE_DEPLOY_FAIL:-}" == "1" ]]; then
  exit 29
fi
next_link="$APP_ROOT/.current.next.$$"
ln -s "$RELEASE_DIR" "$next_link"
node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$next_link" "$APP_ROOT/current"
printf '%s\\n' "$RELEASE_ID" >"$APP_ROOT/executed-release"
`
  );

  const archive = spawnSync('tar', ['-czf', artifactPath, '-C', payload, '.'], {
    encoding: 'utf8',
  });
  expect(archive.status, archive.stderr).toBe(0);

  const artifactBytes = await readFile(artifactPath);
  return {
    artifactPath,
    sha256: createHash('sha256').update(artifactBytes).digest('hex'),
  };
}

async function createArtifactSourceTree(root: string) {
  const sourceRoot = join(root, 'source');
  const requiredFiles = [
    'dist/server/server.js',
    'dist/client/index.html',
    'src/index.ts',
    'scripts/start-server.mjs',
    'scripts/env-file.mjs',
    'scripts/node-runtime.mjs',
    'scripts/bootstrap-app-user.mjs',
    'scripts/link-auth-user.mjs',
    'scripts/smoke-server.mjs',
    'scripts/deploy-artifact-ssm.sh',
    'scripts/deploy-artifact-ec2.sh',
    'deploy/nginx/maintenance.html',
    'deploy/nginx/maintenance.js',
    'deploy/nginx/projex-request-limits.conf',
    'deploy/systemd/projex.service',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.pnpmfile.cjs',
    'patches/brace-expansion@5.0.8.patch',
  ];

  for (const relativePath of requiredFiles) {
    const path = join(sourceRoot, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'test\n');
  }
  return sourceRoot;
}

function runSsmDeploy(
  appRoot: string,
  mockBin: string,
  identity: ReleaseIdentity,
  artifactPath: string,
  artifactSha256: string,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  return spawnSync('bash', [ssmDeployScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      APP_ROOT: appRoot,
      RELEASE_ID: identity.releaseId,
      EXPECTED_GIT_SHA: identity.gitSha,
      DEPLOY_ENVIRONMENT: identity.environment,
      DEPLOY_RUN_ID: identity.runId,
      DEPLOY_RUN_ATTEMPT: identity.runAttempt,
      ARTIFACT_SHA256: artifactSha256,
      ARTIFACT_S3_URI: `s3://projex-test/${identity.releaseId}.tar.gz`,
      ARTIFACT_AWS_REGION: 'ap-southeast-2',
      MOCK_ARTIFACT_SOURCE: artifactPath,
      ...extraEnv,
    },
  });
}

async function createActiveRelease(appRoot: string, releaseId: string) {
  const releaseDir = join(appRoot, 'releases', releaseId);
  await mkdir(releaseDir, { recursive: true });
  await symlink(releaseDir, join(appRoot, 'current'));
  return realpath(releaseDir);
}

async function stagingDirectories(appRoot: string) {
  const entries = await readdir(join(appRoot, 'releases'));
  return entries.filter((entry) => entry.includes('.staging.'));
}

async function createEc2Release(
  appRoot: string,
  releaseId: string,
  expectedGitSha = gitSha
) {
  const releaseDir = join(appRoot, 'releases', releaseId);
  const requiredFiles = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.pnpmfile.cjs',
    'patches/brace-expansion@5.0.8.patch',
    'scripts/start-server.mjs',
    'scripts/env-file.mjs',
    'scripts/node-runtime.mjs',
    'scripts/deploy-artifact-ec2.sh',
    'deploy/nginx/maintenance.html',
    'deploy/nginx/maintenance.js',
    'deploy/nginx/projex-request-limits.conf',
    'deploy/systemd/projex.service',
  ];

  await mkdir(releaseDir, { recursive: true });
  for (const relativePath of requiredFiles) {
    const path = join(releaseDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      relativePath === 'deploy/systemd/projex.service'
        ? await readFile(join(repoRoot, relativePath), 'utf8')
        : 'test\n'
    );
  }
  await writeFile(
    join(releaseDir, '.projex-release.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      releaseId,
      gitSha: expectedGitSha,
      environment: 'staging',
      runId: '100',
      runAttempt: '1',
    })}\n`
  );
  return realpath(releaseDir);
}

function runEc2Deploy(
  appRoot: string,
  mockBin: string,
  releaseId: string,
  releaseDir: string,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  return spawnSync('bash', [ec2DeployScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      APP_ROOT: appRoot,
      RELEASE_ID: releaseId,
      RELEASE_DIR: releaseDir,
      EXPECTED_GIT_SHA: gitSha,
      CURRENT_LINK: join(appRoot, 'current'),
      ENV_FILE: join(appRoot, 'projex.env'),
      SHARED_DIR: join(appRoot, 'shared'),
      NGINX_REQUEST_LIMITS_PATH: join(appRoot, 'nginx', 'request-limits.conf'),
      SYSTEMD_SERVICE_PATH: join(appRoot, 'systemd', 'projex.service'),
      DEPLOY_USER: testDeployUser,
      DEPLOY_HOME: join(appRoot, 'shared', 'deploy-home'),
      DEPLOY_PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      PNPM_BIN: join(mockBin, 'pnpm'),
      HEALTH_URL: 'http://127.0.0.1/health',
      READY_URL: 'http://127.0.0.1/ready',
      HEALTH_TIMEOUT_SECONDS: '1',
      READY_TIMEOUT_SECONDS: '1',
      HTTP_CHECK_INTERVAL_SECONDS: '0',
      KEEP_RELEASES: '5',
      ...extraEnv,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe('create-deploy-artifact.sh', () => {
  test('embeds the immutable release identity manifest', async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = await createArtifactSourceTree(root);
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run99-attempt2',
      runId: '99',
      runAttempt: '2',
    };
    const artifactName = `projex-${identity.releaseId}.tar.gz`;

    const result = spawnSync('bash', [createArtifactScript], {
      cwd: sourceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ARTIFACTS_DIR: join(sourceRoot, 'artifacts'),
        ARTIFACT_NAME: artifactName,
        GIT_SHA: identity.gitSha,
        DEPLOY_ENVIRONMENT: identity.environment,
        DEPLOY_RUN_ID: identity.runId,
        DEPLOY_RUN_ATTEMPT: identity.runAttempt,
        RELEASE_ID: identity.releaseId,
      },
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

    const extractRoot = join(root, 'manifest');
    await mkdir(extractRoot);
    const extract = spawnSync(
      'tar',
      ['-xzf', join(sourceRoot, 'artifacts', artifactName), '-C', extractRoot],
      { encoding: 'utf8' }
    );
    expect(extract.status, extract.stderr).toBe(0);
    await expect(
      readFile(join(extractRoot, '.projex-release.json'), 'utf8').then(
        (value) => JSON.parse(value) as unknown
      )
    ).resolves.toEqual({
      schemaVersion: 1,
      releaseId: identity.releaseId,
      gitSha: identity.gitSha,
      environment: identity.environment,
      runId: identity.runId,
      runAttempt: identity.runAttempt,
    });
  });

  test('rejects unsafe release identifiers before creating an artifact', async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = await createArtifactSourceTree(root);

    const result = spawnSync('bash', [createArtifactScript], {
      cwd: sourceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ARTIFACTS_DIR: join(sourceRoot, 'artifacts'),
        GIT_SHA: gitSha,
        DEPLOY_ENVIRONMENT: 'staging',
        DEPLOY_RUN_ID: '99',
        DEPLOY_RUN_ATTEMPT: '1',
        RELEASE_ID: '../active',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RELEASE_ID must match');
  });
});

describe('deploy-artifact-ssm.sh', () => {
  test('keeps unique physical releases for repeated deploys of one commit', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const firstIdentity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run100-attempt1',
      runId: '100',
      runAttempt: '1',
    };
    const secondIdentity: ReleaseIdentity = {
      ...firstIdentity,
      releaseId: 'staging-aaaaaaaaaaaa-run100-attempt2',
      runAttempt: '2',
    };
    const firstArtifact = await createArtifact(root, firstIdentity, 'first');
    const secondArtifact = await createArtifact(root, secondIdentity, 'second');

    const first = runSsmDeploy(
      appRoot,
      mockBin,
      firstIdentity,
      firstArtifact.artifactPath,
      firstArtifact.sha256
    );
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);

    const second = runSsmDeploy(
      appRoot,
      mockBin,
      secondIdentity,
      secondArtifact.artifactPath,
      secondArtifact.sha256
    );
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0);

    const firstRelease = await realpath(
      join(appRoot, 'releases', firstIdentity.releaseId)
    );
    const secondRelease = await realpath(
      join(appRoot, 'releases', secondIdentity.releaseId)
    );
    expect(firstRelease).toContain(firstIdentity.releaseId);
    expect(secondRelease).toContain(secondIdentity.releaseId);
    expect((await stat(firstRelease)).mode & 0o777).toBe(0o755);
    expect((await stat(secondRelease)).mode & 0o777).toBe(0o755);
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      secondRelease
    );
    await expect(stagingDirectories(appRoot)).resolves.toEqual([]);
  });

  test('does not disturb the active release when download fails', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const activeRelease = await createActiveRelease(appRoot, 'active-release');
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run101-attempt1',
      runId: '101',
      runAttempt: '1',
    };

    const result = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      join(root, 'not-downloaded.tar.gz'),
      'b'.repeat(64),
      { MOCK_AWS_FAIL: '1' }
    );

    expect(result.status).not.toBe(0);
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      activeRelease
    );
    await expect(realpath(activeRelease)).resolves.toBe(activeRelease);
    await expect(stagingDirectories(appRoot)).resolves.toEqual([]);
  });

  test('rejects checksum and manifest mismatches before promotion', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const activeRelease = await createActiveRelease(appRoot, 'active-release');
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run102-attempt1',
      runId: '102',
      runAttempt: '1',
    };
    const artifact = await createArtifact(root, identity, 'checksum');

    const checksumFailure = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      artifact.artifactPath,
      'c'.repeat(64)
    );
    expect(checksumFailure.status).not.toBe(0);
    expect(checksumFailure.stderr).toContain(
      'Downloaded artifact SHA-256 does not match'
    );

    const mismatchedArtifact = await createArtifact(
      root,
      { ...identity, releaseId: 'staging-aaaaaaaaaaaa-run999-attempt1' },
      'manifest'
    );
    const manifestFailure = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      mismatchedArtifact.artifactPath,
      mismatchedArtifact.sha256
    );
    expect(manifestFailure.status).not.toBe(0);
    expect(manifestFailure.stderr).toContain(
      'Deploy manifest release ID does not match'
    );

    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      activeRelease
    );
    await expect(stagingDirectories(appRoot)).resolves.toEqual([]);
  });

  test('refuses to overwrite an existing active release directory', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run103-attempt1',
      runId: '103',
      runAttempt: '1',
    };
    const activeRelease = await createActiveRelease(
      appRoot,
      identity.releaseId
    );
    await writeFile(join(activeRelease, 'sentinel'), 'active');

    const result = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      join(root, 'unused.tar.gz'),
      'd'.repeat(64)
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Refusing to overwrite active release');
    await expect(
      readFile(join(activeRelease, 'sentinel'), 'utf8')
    ).resolves.toBe('active');
  });

  test('repairs a broken current-release symlink before promotion', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    await mkdir(join(appRoot, 'releases'), { recursive: true });
    await symlink(
      join(appRoot, 'releases', 'missing-release'),
      join(appRoot, 'current')
    );
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run104-attempt1',
      runId: '104',
      runAttempt: '1',
    };
    const artifact = await createArtifact(root, identity, 'broken-current');

    const result = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      artifact.artifactPath,
      artifact.sha256
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Removing broken current-release symlink');
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      await realpath(join(appRoot, 'releases', identity.releaseId))
    );
  });

  test('safely retries an exact matching inactive failed release', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run105-attempt1',
      runId: '105',
      runAttempt: '1',
    };
    const artifact = await createArtifact(root, identity, 'retry');

    const failed = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      artifact.artifactPath,
      artifact.sha256,
      { MOCK_RELEASE_DEPLOY_FAIL: '1' }
    );
    expect(failed.status).not.toBe(0);
    await expect(
      realpath(join(appRoot, 'releases', identity.releaseId))
    ).resolves.toContain(identity.releaseId);
    await expect(realpath(join(appRoot, 'current'))).rejects.toThrow();

    const retried = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      artifact.artifactPath,
      artifact.sha256
    );
    expect(retried.status, `${retried.stdout}\n${retried.stderr}`).toBe(0);
    expect(retried.stdout).toContain(
      'Removing matching inactive failed release before retry promotion'
    );
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      await realpath(join(appRoot, 'releases', identity.releaseId))
    );
  }, 20_000);

  test('preserves an inactive failed release until its retry artifact validates', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const identity: ReleaseIdentity = {
      environment: 'staging',
      gitSha,
      releaseId: 'staging-aaaaaaaaaaaa-run106-attempt1',
      runId: '106',
      runAttempt: '1',
    };
    const artifact = await createArtifact(root, identity, 'retry-checksum');

    const failed = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      artifact.artifactPath,
      artifact.sha256,
      { MOCK_RELEASE_DEPLOY_FAIL: '1' }
    );
    expect(failed.status).not.toBe(0);
    const failedRelease = join(appRoot, 'releases', identity.releaseId);
    await writeFile(join(failedRelease, 'sentinel'), 'preserved');

    const invalidRetry = runSsmDeploy(
      appRoot,
      mockBin,
      identity,
      artifact.artifactPath,
      'f'.repeat(64)
    );
    expect(invalidRetry.status).not.toBe(0);
    await expect(
      readFile(join(failedRelease, 'sentinel'), 'utf8')
    ).resolves.toBe('preserved');
  }, 20_000);
});

describe('deploy-artifact-ec2.sh', () => {
  test('installs dependencies and migrates as the constrained deployment identity', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const pnpmLog = join(root, 'pnpm.log');
    const sudoLog = join(root, 'sudo.log');
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const releaseId = 'staging-aaaaaaaaaaaa-run198-attempt1';
    const releaseDir = await createEc2Release(appRoot, releaseId);

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir, {
      MOCK_SUDO_LOG: sudoLog,
      SERVICE_NAME: 'projex-custom',
      SYSTEMD_SERVICE_PATH: join(appRoot, 'systemd', 'projex-custom.service'),
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const pnpmCalls = await readFile(pnpmLog, 'utf8');
    expect(pnpmCalls).toContain(
      `${testDeployUser}\tinstall --frozen-lockfile --prod --ignore-scripts`
    );
    expect(pnpmCalls).toContain(`${testDeployUser}\trun db:migrate`);
    const sudoCalls = await readFile(sudoLog, 'utf8');
    expect(sudoCalls).toContain(
      `--non-interactive --user ${testDeployUser} -- env -i`
    );
    expect(sudoCalls).toContain(`chown -R ${testDeployUser}:`);
    expect(sudoCalls).toContain(`chown -R root:root ${releaseDir}`);
    expect(sudoCalls).toContain('systemctl enable projex-custom');
    const installedServicePath = join(
      appRoot,
      'systemd',
      'projex-custom.service'
    );
    const installedService = await readFile(installedServicePath, 'utf8');
    expect(installedService).toContain(
      `WorkingDirectory=${join(appRoot, 'current')}`
    );
    expect(installedService).toContain(
      `EnvironmentFile=${join(appRoot, 'projex.env')}`
    );
    expect(installedService).not.toContain('/opt/projex/current');
    expect(installedService).not.toContain('/etc/projex/projex.env');
  });

  test('rejects application roots hidden by the service home-directory sandbox', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const releaseId = 'staging-aaaaaaaaaaaa-run198-attempt2';
    const releaseDir = await createEc2Release(appRoot, releaseId);

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir, {
      APP_ROOT: '/home/ec2-user/projex',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'APP_ROOT must not be located under /home, /root, or /run/user'
    );
  });

  test('rejects service names that already include the systemd unit suffix', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const releaseId = 'staging-aaaaaaaaaaaa-run198-attempt3';
    const releaseDir = await createEc2Release(appRoot, releaseId);

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir, {
      SERVICE_NAME: 'projex-custom.service',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'SERVICE_NAME must omit the .service suffix'
    );
  });

  test('activates a validated release with an atomic symlink replacement', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const previousRelease = await createEc2Release(
      appRoot,
      'staging-aaaaaaaaaaaa-run199-attempt1'
    );
    await symlink(previousRelease, join(appRoot, 'current'));
    const releaseId = 'staging-aaaaaaaaaaaa-run200-attempt1';
    const releaseDir = await createEc2Release(appRoot, releaseId);

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(releaseDir);
    await expect(realpath(previousRelease)).resolves.toBe(previousRelease);
  });

  test('leaves the previous release active when migrations fail', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const sudoLog = join(root, 'sudo.log');
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const previousRelease = await createEc2Release(
      appRoot,
      'staging-aaaaaaaaaaaa-run200-attempt1'
    );
    await symlink(previousRelease, join(appRoot, 'current'));
    const releaseId = 'staging-aaaaaaaaaaaa-run201-attempt1';
    const releaseDir = await createEc2Release(appRoot, releaseId);
    await writeFile(join(root, 'fail-migrate'), '');

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir, {
      MOCK_SUDO_LOG: sudoLog,
    });

    expect(result.status).not.toBe(0);
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      previousRelease
    );
    const sudoCalls = await readFile(sudoLog, 'utf8');
    expect(sudoCalls).toContain(`chown -R ${testDeployUser}:`);
    expect(sudoCalls).toContain(`chown -R root:root ${releaseDir}`);
  });

  test('keeps a successful forward migration when readiness rollback restores the compatible previous release', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const previousRelease = await createEc2Release(
      appRoot,
      'staging-aaaaaaaaaaaa-run201-attempt1'
    );
    await symlink(previousRelease, join(appRoot, 'current'));
    const releaseId = 'staging-aaaaaaaaaaaa-run202-attempt1';
    const releaseDir = await createEc2Release(appRoot, releaseId);
    const systemdServicePath = join(appRoot, 'systemd', 'projex.service');
    await mkdir(dirname(systemdServicePath), { recursive: true });
    await writeFile(systemdServicePath, 'previous systemd unit\n');

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir, {
      READY_TIMEOUT_SECONDS: '0',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Readiness check failed');
    await expect(stat(join(root, 'migration-applied'))).resolves.toBeDefined();
    await expect(realpath(join(appRoot, 'current'))).resolves.toBe(
      previousRelease
    );
    await expect(realpath(releaseDir)).resolves.toBe(releaseDir);
    await expect(readFile(systemdServicePath, 'utf8')).resolves.toBe(
      'previous systemd unit\n'
    );
  });

  test('stops a failed service when the first release rolls back', async () => {
    const root = await makeTemporaryRoot();
    const appRoot = join(root, 'app');
    const mockBin = await createMockCommands(root);
    const sudoLog = join(root, 'sudo.log');
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, 'projex.env'), '');
    const releaseId = 'staging-aaaaaaaaaaaa-run203-attempt1';
    const releaseDir = await createEc2Release(appRoot, releaseId);

    const result = runEc2Deploy(appRoot, mockBin, releaseId, releaseDir, {
      MOCK_SUDO_LOG: sudoLog,
      READY_TIMEOUT_SECONDS: '0',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Readiness check failed');
    await expect(realpath(join(appRoot, 'current'))).rejects.toThrow();
    await expect(readFile(sudoLog, 'utf8')).resolves.toContain(
      'systemctl stop projex'
    );
    await expect(realpath(releaseDir)).resolves.toBe(releaseDir);
  });
});

describe('provision-letsencrypt-cert.sh', () => {
  test.each([
    {
      expectedDirective: '  http2 on;',
      expectedListen: 'listen 443 ssl;',
      nginxVersion: '1.28.0',
      unexpectedListen: 'listen 443 ssl http2;',
    },
    {
      expectedDirective: '',
      expectedListen: 'listen 443 ssl http2;',
      nginxVersion: '1.18.0',
      unexpectedListen: 'listen 443 ssl;',
    },
  ])(
    'renders HTTP/2 syntax for nginx $nginxVersion',
    async ({
      expectedDirective,
      expectedListen,
      nginxVersion,
      unexpectedListen,
    }) => {
      const root = await makeTemporaryRoot();
      const outputPath = join(root, 'projex.conf');
      const result = spawnSync(
        'bash',
        [
          '-c',
          'source "$1"; nginx() { printf "nginx version: nginx/%s\\n" "$MOCK_NGINX_VERSION" >&2; }; render_tls_config projectexpensetracker.com "projectexpensetracker.com www.projectexpensetracker.com"',
          'projex-nginx-render-test',
          letsEncryptScript,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MOCK_NGINX_VERSION: nginxVersion,
            NGINX_CONF_PATH: outputPath,
            NGINX_TLS_TEMPLATE_PATH: nginxTlsTemplate,
          },
        }
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const config = await readFile(outputPath, 'utf8');
      expect(config).toContain(expectedListen);
      expect(config).not.toContain(unexpectedListen);
      if (expectedDirective) {
        expect(config).toContain(expectedDirective);
      } else {
        expect(config).not.toContain('http2 on;');
      }
      expect(config).not.toContain('__HTTP2_');
    }
  );
});

describe('deploy workflow retry identity', () => {
  test('reuses the artifact build attempt when only failed jobs rerun', async () => {
    const workflow = await readFile(deployWorkflow, 'utf8');

    expect(workflow).toContain(
      'run-attempt: ${{ steps.package.outputs.run_attempt }}'
    );
    expect(workflow).toContain(
      'echo "run_attempt=${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_OUTPUT"'
    );
    expect(workflow).toContain(
      'DEPLOY_RUN_ATTEMPT: ${{ needs.build-artifact.outputs.run-attempt }}'
    );
    expect(workflow).not.toContain(
      'DEPLOY_RUN_ATTEMPT: ${{ github.run_attempt }}'
    );
  });
});
