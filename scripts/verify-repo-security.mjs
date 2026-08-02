import { readFile } from 'node:fs/promises';

const optionalDeploymentEnvPaths = ['.env.production', '.env.staging'];
const nginxProxyConfigPaths = [
  'deploy/nginx/projex.bootstrap.conf',
  'deploy/nginx/projex.conf',
  'deploy/nginx/projex.https.conf.template',
];
const nginxRequestLimitsPath = 'deploy/nginx/projex-request-limits.conf';
const nginxImportBodyLimit = 'client_max_body_size 16m;';
const nginxCompressionPath = 'deploy/nginx/projex-compression.conf';
const braceExpansionPatchPath = 'patches/brace-expansion@5.0.8.patch';

const checks = [
  {
    path: '.env.production',
    optional: true,
    requiredIncludes: [
      'PROJEX_ENABLE_DEV_ENDPOINTS=false',
      'PROJEX_ENABLE_SMOKE_TOOLS=false',
      'BETTER_AUTH_SECRET=<GENERATE_A_LONG_RANDOM_SECRET>',
      'BETTER_AUTH_URL=https://',
      'BETTER_AUTH_TRUSTED_ORIGINS=https://',
    ],
    forbiddenPatterns: [
      /BETTER_AUTH_SECRET=(?!<GENERATE_A_LONG_RANDOM_SECRET>)[^\s#]+/,
      /DATABASE_URL=postgres:\/\/(?![^\n]*<)[^\n]*@/i,
    ],
  },
  {
    path: '.env.staging',
    optional: true,
    requiredIncludes: [
      'PROJEX_ENABLE_DEV_ENDPOINTS=false',
      'PROJEX_ENABLE_SMOKE_TOOLS=false',
      'BETTER_AUTH_SECRET=<GENERATE_A_LONG_RANDOM_SECRET>',
      'BETTER_AUTH_URL=https://',
      'BETTER_AUTH_TRUSTED_ORIGINS=https://',
    ],
    forbiddenPatterns: [
      /BETTER_AUTH_SECRET=(?!<GENERATE_A_LONG_RANDOM_SECRET>)[^\s#]+/,
      /DATABASE_URL=postgres:\/\/(?![^\n]*<)[^\n]*@/i,
      /BETTER_AUTH_URL=http:\/\//i,
      /BETTER_AUTH_TRUSTED_ORIGINS=http:\/\//i,
      /CORS_ALLOWED_ORIGINS=http:\/\//i,
    ],
  },
  {
    path: '.env.example',
    requiredIncludes: [
      'PROJEX_ENABLE_DEV_ENDPOINTS=false',
      'PROJEX_ENABLE_SMOKE_TOOLS=false',
      'BETTER_AUTH_SECRET=replace-with-long-random-secret',
    ],
    forbiddenPatterns: [],
  },
];

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function hasMatchingImmutableAttestPins(workflow) {
  const declaredAttestUses =
    workflow.match(
      /^[ \t]*uses:[ \t]+actions\/attest@[^\s#]+(?:[ \t]+#[^\r\n]*)?[ \t]*\r?$/gmu
    ) ?? [];
  const immutableAttestShas = [
    ...workflow.matchAll(
      /^[ \t]*uses:[ \t]+actions\/attest@([0-9a-f]{40})[ \t]+#[ \t]*v4[ \t]*\r?$/gmu
    ),
  ].map((match) => match[1]);

  return (
    declaredAttestUses.length === 2 &&
    immutableAttestShas.length === 2 &&
    new Set(immutableAttestShas).size === 1
  );
}

async function verifyFile(check) {
  let content;
  try {
    content = await readFile(check.path, 'utf8');
  } catch (error) {
    if (
      check.optional &&
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {
        skipped: true,
        reason: `${check.path} not present in this checkout`,
      };
    }
    throw error;
  }

  for (const required of check.requiredIncludes) {
    assertCondition(
      content.includes(required),
      `${check.path} is missing required entry: ${required}`
    );
  }

  for (const pattern of check.forbiddenPatterns) {
    assertCondition(
      !pattern.test(content),
      `${check.path} contains a value that should not be committed: ${pattern}`
    );
  }

  return { skipped: false };
}

async function verifyGitignoreCoverage() {
  const gitignore = await readFile('.gitignore', 'utf8');
  for (const envPath of optionalDeploymentEnvPaths) {
    assertCondition(
      gitignore.split(/\r?\n/).includes(envPath),
      `.gitignore must ignore ${envPath}`
    );
  }
}

async function verifyTrustedProxyClientIpHeaders() {
  for (const path of nginxProxyConfigPaths) {
    const content = await readFile(path, 'utf8');
    const appLocation = content.match(/location \/ \{[\s\S]*?\n\s*\}/)?.[0];
    assertCondition(
      appLocation,
      `${path} is missing its application proxy location`
    );
    assertCondition(
      appLocation.includes('proxy_set_header X-Real-IP $remote_addr;'),
      `${path} must overwrite X-Real-IP with the direct client address`
    );
  }
}

async function verifyNginxRequestLimits() {
  const [requestLimits, createArtifactScript, deployScript] = await Promise.all(
    [
      readFile(nginxRequestLimitsPath, 'utf8'),
      readFile('scripts/create-deploy-artifact.sh', 'utf8'),
      readFile('scripts/deploy-artifact-ec2.sh', 'utf8'),
    ]
  );
  assertCondition(
    requestLimits.includes(nginxImportBodyLimit),
    `${nginxRequestLimitsPath} must retain the bounded ${nginxImportBodyLimit} import allowance`
  );
  assertCondition(
    createArtifactScript.includes(
      `require_tooling_path "${nginxRequestLimitsPath}"`
    ),
    'Deploy artifacts must require the managed nginx request limits'
  );
  assertCondition(
    deployScript.includes(nginxRequestLimitsPath),
    'Artifact deploys must install the managed nginx request limits'
  );
  assertCondition(
    deployScript.includes('sudo nginx -t'),
    'Artifact deploys must validate nginx before reloading it'
  );
}

async function verifyNginxCompression() {
  const [compression, createArtifactScript, deployScript, hostBootstrap] =
    await Promise.all([
      readFile(nginxCompressionPath, 'utf8'),
      readFile('scripts/create-deploy-artifact.sh', 'utf8'),
      readFile('scripts/deploy-artifact-ec2.sh', 'utf8'),
      readFile('deploy/cdk/lib/hostBootstrap.ts', 'utf8'),
    ]);

  for (const requiredDirective of [
    'gzip on;',
    'gzip_vary on;',
    'gzip_proxied any;',
    'gzip_min_length 1024;',
    'text/css',
    'application/javascript',
    'application/json',
    'image/svg+xml',
  ]) {
    assertCondition(
      compression.includes(requiredDirective),
      `${nginxCompressionPath} is missing required entry: ${requiredDirective}`
    );
  }
  assertCondition(
    createArtifactScript.includes(
      `require_tooling_path "${nginxCompressionPath}"`
    ),
    'Deploy artifacts must require the managed nginx compression policy'
  );
  assertCondition(
    deployScript.includes(nginxCompressionPath) &&
      deployScript.includes('NGINX_COMPRESSION_PATH'),
    'Artifact deploys must install the managed nginx compression policy'
  );
  assertCondition(
    hostBootstrap.includes(nginxCompressionPath) &&
      hostBootstrap.includes('/etc/nginx/conf.d/projex-compression.conf'),
    'Fresh hosts must install the managed nginx compression policy'
  );
}

async function verifyNginxHttp2Syntax() {
  const [staticConfig, tlsTemplate, provisionScript] = await Promise.all([
    readFile('deploy/nginx/projex.conf', 'utf8'),
    readFile('deploy/nginx/projex.https.conf.template', 'utf8'),
    readFile('scripts/provision-letsencrypt-cert.sh', 'utf8'),
  ]);

  assertCondition(
    staticConfig.includes('listen 443 ssl http2;') &&
      staticConfig.includes('listen [::]:443 ssl http2;'),
    'The static nginx config must retain the HTTP/2 syntax supported by Ubuntu 22.04 nginx'
  );
  assertCondition(
    tlsTemplate.includes('listen 443 ssl__HTTP2_LISTEN_SUFFIX__;') &&
      tlsTemplate.includes('listen [::]:443 ssl__HTTP2_LISTEN_SUFFIX__;') &&
      tlsTemplate.includes('__HTTP2_DIRECTIVE__') &&
      provisionScript.includes('BASH_REMATCH[2] == 25') &&
      provisionScript.includes('BASH_REMATCH[3] >= 1') &&
      provisionScript.includes(
        '-e "s/__HTTP2_LISTEN_SUFFIX__/${http2_listen_suffix}/g"'
      ) &&
      provisionScript.includes(
        '-e "s/__HTTP2_DIRECTIVE__/${http2_directive}/g"'
      ) &&
      provisionScript.includes(
        'for timer in certbot-renew.timer certbot.timer; do'
      ) &&
      provisionScript.includes('systemctl enable --now "$timer"') &&
      provisionScript.includes('systemctl is-enabled --quiet "$timer"') &&
      provisionScript.includes('systemctl is-active --quiet "$timer"'),
    'The TLS helper must render compatible HTTP/2 syntax and enable automatic certificate renewal'
  );
}

async function verifyDeployArtifactDependencyPatches() {
  const [workspaceConfig, createArtifactScript, deployScript, patch] =
    await Promise.all([
      readFile('pnpm-workspace.yaml', 'utf8'),
      readFile('scripts/create-deploy-artifact.sh', 'utf8'),
      readFile('scripts/deploy-artifact-ec2.sh', 'utf8'),
      readFile(braceExpansionPatchPath, 'utf8'),
    ]);

  assertCondition(
    workspaceConfig.includes(
      `brace-expansion@5.0.8: ${braceExpansionPatchPath}`
    ),
    'The brace-expansion compatibility patch must stay registered with pnpm'
  );
  assertCondition(
    createArtifactScript.includes(
      `require_source_path "${braceExpansionPatchPath}"`
    ),
    'Deploy artifact creation must require the brace-expansion compatibility patch'
  );
  assertCondition(
    /\n\s+patches\s+\\$/m.test(createArtifactScript),
    'Deploy artifacts must include the patches directory'
  );
  assertCondition(
    deployScript.includes(
      `require_file "$RELEASE_DIR/${braceExpansionPatchPath}"`
    ),
    'Artifact deploys must verify the brace-expansion compatibility patch before installing dependencies'
  );
  assertCondition(
    patch.includes('module.exports = Object.assign(expand, exports);'),
    'The brace-expansion patch must retain the callable CommonJS compatibility export'
  );
}

async function verifyDeployReleaseIdentity() {
  const [
    deployWorkflow,
    releaseWorkflow,
    createArtifactScript,
    bundleVerifier,
    deployRequestMetadata,
    ssmScript,
    ec2Script,
  ] = await Promise.all([
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('.github/workflows/release.yml', 'utf8'),
    readFile('scripts/create-deploy-artifact.sh', 'utf8'),
    readFile('scripts/verify-release-bundle.mjs', 'utf8'),
    readFile('scripts/deploy-request-metadata.mjs', 'utf8'),
    readFile('scripts/deploy-artifact-ssm.sh', 'utf8'),
    readFile('scripts/deploy-artifact-ec2.sh', 'utf8'),
  ]);

  assertCondition(
    releaseWorkflow.includes("github.event.workflow_run.event == 'push'") &&
      releaseWorkflow.includes(
        "github.event.workflow_run.head_branch == 'main'"
      ) &&
      releaseWorkflow.includes(
        'github.event.workflow_run.head_repository.full_name == github.repository'
      ) &&
      releaseWorkflow.includes(
        'ref: ${{ github.event.workflow_run.head_sha || github.sha }}'
      ) &&
      releaseWorkflow.includes(
        'ref: ${{ github.event.workflow_run.head_sha || inputs.recovery_ref }}'
      ) &&
      releaseWorkflow.includes('path: release-tooling') &&
      releaseWorkflow.includes('path: application-source') &&
      deployWorkflow.includes('ref: ${{ github.sha }}') &&
      !deployWorkflow.includes('ref: ${{ steps.release.outputs.git_sha }}'),
    'Releases must build immutable application source while packaging and deploying with protected workflow tooling'
  );
  assertCondition(
    releaseWorkflow.includes(
      'RELEASE_SOURCE_ROOT="$GITHUB_WORKSPACE/application-source"'
    ) &&
      releaseWorkflow.includes(
        'RELEASE_TOOLING_ROOT="$GITHUB_WORKSPACE/release-tooling"'
      ) &&
      releaseWorkflow.includes(
        'bash release-tooling/scripts/create-deploy-artifact.sh'
      ) &&
      releaseWorkflow.includes(
        'node release-tooling/scripts/verify-release-bundle.mjs artifacts'
      ) &&
      deployWorkflow.includes('- name: Checkout protected deployment tooling'),
    'Historical recovery source must not replace the current packaging, verification, or deployment tooling'
  );
  assertCondition(
    releaseWorkflow.includes('BUILD_RUN_ID="$GITHUB_RUN_ID"') &&
      releaseWorkflow.includes('BUILD_RUN_ATTEMPT="$GITHUB_RUN_ATTEMPT"') &&
      deployWorkflow.includes(
        'ARTIFACT_SHA256: ${{ steps.release.outputs.artifact_sha256 }}'
      ),
    'Physical release identity must include the build run and verified artifact checksum'
  );
  assertCondition(
    createArtifactScript.includes('.projex-release.json') &&
      createArtifactScript.includes('"gitSha": "%s"') &&
      createArtifactScript.includes('"buildRunAttempt": "%s"') &&
      !createArtifactScript.includes('"environment": "%s"'),
    'Deploy artifacts must embed their immutable release manifest'
  );
  assertCondition(
    hasMatchingImmutableAttestPins(releaseWorkflow) &&
      releaseWorkflow.includes('pnpm --dir application-source sbom') &&
      releaseWorkflow.includes('--prod') &&
      releaseWorkflow.includes('--sbom-format spdx') &&
      releaseWorkflow.includes('retention-days: 90') &&
      deployWorkflow.includes('gh attestation verify "$ARTIFACT_PATH"') &&
      deployWorkflow.includes(
        '--predicate-type https://spdx.dev/Document/v2.3'
      ),
    'Release artifacts must use two matching immutable actions/attest v4 pins and retain and verify signed provenance and a production SPDX SBOM'
  );
  assertCondition(
    deployWorkflow.includes(
      'run-id: ${{ steps.selected-release.outputs.run_id }}'
    ) &&
      deployWorkflow.includes('pattern: projex-release-*') &&
      deployWorkflow.includes(
        'run: node scripts/verify-release-bundle.mjs artifacts'
      ) &&
      !deployWorkflow.includes('pnpm run build') &&
      bundleVerifier.includes(
        'Release bundle must contain exactly one Projex deploy artifact.'
      ),
    'Deployments must promote one selected retained release without rebuilding it'
  );
  assertCondition(
    deployWorkflow.includes('release_selection:') &&
      deployWorkflow.includes('- latest-successful') &&
      deployWorkflow.includes('- specific-run-id') &&
      deployWorkflow.includes(
        'actions/workflows/release.yml/runs?branch=main&status=success&per_page=20'
      ) &&
      deployWorkflow.includes(
        'Production promotion requires the specific Release run tested in staging.'
      ) &&
      deployWorkflow.includes(
        'Rollback requires the specific retained N-1 Release run ID.'
      ),
    'Deploy selection must resolve latest staging releases while preserving explicit production and rollback identity'
  );
  assertCondition(
    deployWorkflow.includes('node scripts/deploy-request-metadata.mjs') &&
      deployWorkflow.includes('--comment "$SSM_COMMENT"') &&
      !deployWorkflow.includes('${DEPLOYMENT_REASON:0:40}') &&
      deployRequestMetadata.includes(
        'export const SSM_COMMENT_MAX_LENGTH = 100'
      ) &&
      deployRequestMetadata.includes(
        '`${action} ${sourceLabel} to ${normalizedEnvironment}`'
      ),
    'Deployment audit reasons must be derived from immutable source identity and the complete SSM comment must be bounded'
  );
  assertCondition(
    ssmScript.includes(
      'mktemp -d "${RELEASES_DIR}/.${RELEASE_ID}.staging.XXXXXX"'
    ) &&
      ssmScript.includes(
        '\'require("node:fs").renameSync(process.argv[1], process.argv[2])\''
      ) &&
      ssmScript.includes(
        'validate_manifest_identity "$RELEASE_DIR/.projex-release.json"'
      ) &&
      ssmScript.includes(
        'active_release_dir="$(resolve_existing_path "$CURRENT_LINK"'
      ) &&
      ssmScript.includes('rm -rf -- "$RELEASE_DIR"') &&
      ssmScript.includes(
        'Rollback target must be the retained immediately previous release.'
      ),
    'SSM deploys must validate in a fresh staging directory, preserve active releases, and only replace an identity-matched inactive retry'
  );
  assertCondition(
    ec2Script.includes('active_release_dir="$(current_release_dir') &&
      ec2Script.includes('activate_release "$RELEASE_DIR"') &&
      ec2Script.includes('record_previous_release') &&
      ec2Script.includes('rm -rf -- "$dir"'),
    'Release activation and pruning must preserve the active and immediately previous releases'
  );
}

async function verifyGithubDeployOidcBoundary() {
  const [workflow, cdkApp, identityStack, deployStack] = await Promise.all([
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('deploy/cdk/bin/projex-infra.ts', 'utf8'),
    readFile('deploy/cdk/lib/projex-github-identity-stack.ts', 'utf8'),
    readFile('deploy/cdk/lib/projex-github-deploy-stack.ts', 'utf8'),
  ]);
  const identitySourceLines = new Set(
    identityStack.split(/\r?\n/u).map((line) => line.trim())
  );

  assertCondition(
    workflow.includes('vars.AWS_DEPLOY_ROLE_ARN') &&
      workflow.includes('id-token: write') &&
      workflow.includes('Configure AWS credentials from GitHub OIDC'),
    'EC2 deploys must authenticate through the protected environment OIDC role'
  );
  for (const forbiddenStaticCredential of [
    'secrets.AWS_ACCESS_KEY_ID',
    'secrets.AWS_SECRET_ACCESS_KEY',
    'aws-access-key-id:',
    'aws-secret-access-key:',
  ]) {
    assertCondition(
      !workflow.includes(forbiddenStaticCredential),
      `Deploy workflow must not retain static AWS credential input: ${forbiddenStaticCredential}`
    );
  }
  assertCondition(
    cdkApp.includes('ProjexGithubIdentityStack') &&
      identitySourceLines.has(
        "url: 'https://token.actions.githubusercontent.com',"
      ) &&
      identitySourceLines.has("clientIdList: ['sts.amazonaws.com'],"),
    'CDK must own the account-wide GitHub Actions OIDC provider'
  );
  assertCondition(
    deployStack.includes("'token.actions.githubusercontent.com:sub'") &&
      deployStack.includes(
        'repo:${props.githubRepository}:environment:${props.envName}'
      ) &&
      deployStack.includes("'s3:PutObject'") &&
      deployStack.includes('artifactBucket.arnForObjects') &&
      deployStack.includes("actions: ['ssm:SendCommand']") &&
      deployStack.includes("actions: ['ssm:GetCommandInvocation']"),
    'CDK deploy roles must bind the protected GitHub environment to narrow S3 and SSM permissions'
  );
}

async function verifyHostPrivilegeBoundaries() {
  const [
    deployScript,
    migrationLauncher,
    service,
    infraStack,
    hostBootstrap,
    artifactScript,
    journaldConfig,
  ] = await Promise.all([
    readFile('scripts/deploy-artifact-ec2.sh', 'utf8'),
    readFile('scripts/run-release-migrations.mjs', 'utf8'),
    readFile('deploy/systemd/projex.service', 'utf8'),
    readFile('deploy/cdk/lib/projex-infra-stack.ts', 'utf8'),
    readFile('deploy/cdk/lib/hostBootstrap.ts', 'utf8'),
    readFile('scripts/create-deploy-artifact.sh', 'utf8'),
    readFile('deploy/systemd/projex-journald.conf', 'utf8'),
  ]);

  assertCondition(
    deployScript.includes('DEPLOY_USER="${DEPLOY_USER:-projex-deploy}"') &&
      deployScript.includes(
        'sudo --non-interactive --user "$DEPLOY_USER" -- "$@"'
      ) &&
      deployScript.includes(
        '"$PNPM_BIN" install --frozen-lockfile --prod --ignore-scripts'
      ) &&
      /Running database migrations as[\s\S]*?run_as_deploy_user[\s\S]*?run-release-migrations\.mjs/.test(
        deployScript
      ) &&
      migrationLauncher.includes(
        "const child = spawn(pnpmBin, ['run', 'db:migrate']"
      ) &&
      artifactScript.includes('scripts/run-release-migrations.mjs'),
    'On-host dependency installation and migrations must run as the constrained deployment identity'
  );
  assertCondition(
    deployScript.includes('sudo chown -R root:root "$RELEASE_DIR"') &&
      deployScript.includes(
        'sudo chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$RELEASE_DIR"'
      ) &&
      deployScript.includes('sudo chmod -R a+rX,go-w "$RELEASE_DIR"') &&
      deployScript.includes('sudo chmod 0640 "$ENV_FILE"'),
    'Deploys must restore root ownership and restrict environment-file access'
  );
  assertCondition(
    deployScript.includes('render_systemd_service') &&
      deployScript.includes(
        'service = service.replaceAll(placeholder, value);'
      ) &&
      deployScript.includes(
        `"$source_path" "$destination_path" "$CURRENT_LINK" "$ENV_FILE"`
      ) &&
      deployScript.includes('validate_service_sandbox_path "APP_ROOT"') &&
      deployScript.includes('sudo systemctl enable "$SERVICE_NAME"') &&
      deployScript.includes('preserve_systemd_service') &&
      deployScript.includes('restore_systemd_service') &&
      deployScript.includes('commit_systemd_service'),
    'The installed systemd unit must retain validated APP_ROOT and ENV_FILE overrides'
  );

  for (const directive of [
    'NoNewPrivileges=true',
    'PrivateMounts=true',
    'PrivateTmp=true',
    'ProtectHome=true',
    'ProtectSystem=strict',
    'ReadWritePaths=/var/lib/projex',
    'RemoveIPC=true',
    'CapabilityBoundingSet=',
    'AmbientCapabilities=',
  ]) {
    assertCondition(
      service.includes(directive),
      `The Projex systemd sandbox is missing ${directive}`
    );
  }
  assertCondition(
    service.includes(
      'ExecStart=/usr/local/bin/node --import tsx scripts/start-server.mjs'
    ) && !/^ExecStart=.*\bpnpm\b/m.test(service),
    'The sandboxed runtime must start Node directly without a user-home Corepack dependency'
  );
  assertCondition(
    service.includes('LogRateLimitIntervalSec=30s') &&
      service.includes('LogRateLimitBurst=1000') &&
      journaldConfig.includes('SystemMaxUse=512M') &&
      journaldConfig.includes('SystemKeepFree=2G') &&
      journaldConfig.includes('MaxRetentionSec=7day') &&
      deployScript.includes('systemctl restart systemd-journald'),
    'Structured logs must have per-service rate limits and bounded host retention'
  );

  assertCondition(
    infraStack.includes('httpTokens: ec2.HttpTokens.REQUIRED'),
    'The application instance must explicitly require IMDSv2'
  );
  assertCondition(
    hostBootstrap.includes('projex-deploy') &&
      hostBootstrap.includes('chown -R root:root /opt/projex') &&
      hostBootstrap.includes('chown root:projex-deploy /etc/projex/projex.env'),
    'Fresh hosts must provision the constrained deploy identity and root-owned release tree'
  );
  assertCondition(
    artifactScript.includes(
      'require_tooling_path "deploy/systemd/projex.service"'
    ) &&
      artifactScript.includes(
        'require_tooling_path "deploy/systemd/projex-journald.conf"'
      ) &&
      artifactScript.includes('deploy/systemd/projex.service') &&
      artifactScript.includes('deploy/systemd/projex-journald.conf'),
    'Deploy artifacts must carry the reviewed systemd and journald definitions'
  );
}

async function verifyMigrationRollbackContract() {
  const [migrationPolicy, pullRequestTemplate, deployTests] = await Promise.all(
    [
      readFile('docs/development/database-migrations.md', 'utf8'),
      readFile('.github/pull_request_template.md', 'utf8'),
      readFile('tests/deployArtifactScripts.test.ts', 'utf8'),
    ]
  );

  assertCondition(
    migrationPolicy.includes('expand/migrate/contract') &&
      migrationPolicy.includes('release `N-1`') &&
      migrationPolicy.includes('does not and must not attempt to reverse'),
    'Migration guidance must retain the forward-only rollback compatibility contract'
  );
  assertCondition(
    pullRequestTemplate.includes(
      'The upgraded schema remains compatible with the immediately previous'
    ) &&
      pullRequestTemplate.includes(
        'Rollback evidence confirms the previous release can run'
      ),
    'The pull-request template must require migration compatibility and rollback evidence'
  );
  assertCondition(
    deployTests.includes(
      'keeps a successful forward migration when readiness rollback restores the compatible previous release'
    ) && deployTests.includes("'migration-applied'"),
    'Deploy tests must prove that application rollback retains a committed forward migration'
  );
}

async function verifyRepositoryDocumentation() {
  const [
    readme,
    contributing,
    pullRequestTemplate,
    deadCodeDocumentation,
    knipConfigurationText,
    deploymentDocumentation,
    stagingRunbook,
    license,
    packageManifestText,
  ] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('CONTRIBUTING.md', 'utf8'),
    readFile('.github/pull_request_template.md', 'utf8'),
    readFile('docs/development/dead-code-verification.md', 'utf8'),
    readFile('knip.json', 'utf8'),
    readFile('docs/operations/deployment-ec2.md', 'utf8'),
    readFile('docs/operations/staging-runbook.md', 'utf8'),
    readFile('LICENSE', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  const knipConfiguration = JSON.parse(knipConfigurationText);
  const packageManifest = JSON.parse(packageManifestText);
  const fullBrowserInstallCommand =
    'pnpm exec playwright install --with-deps chromium firefox';

  assertCondition(
    readme.includes(
      'https://github.com/code-studio-au/projex/actions/workflows/ci.yml'
    ) &&
      readme.includes('It currently runs five required lanes:') &&
      readme.includes('The protected `main` branch requires all five lanes'),
    'README CI ownership and required-lane documentation must remain current'
  );
  assertCondition(
    !contributing.includes('GitHub Code Quality') &&
      !contributing.includes('ratings at **Excellent**') &&
      contributing.includes('GitHub CodeQL, Dependabot, and secret scanning'),
    'CONTRIBUTING must describe the configured GitHub security analysis'
  );
  assertCondition(
    !pullRequestTemplate.includes('GitHub Code Quality') &&
      pullRequestTemplate.includes(
        'GitHub CodeQL and dependency/security analysis'
      ),
    'The pull-request template must describe the configured security analysis'
  );
  assertCondition(
    contributing.includes(fullBrowserInstallCommand) &&
      deploymentDocumentation.includes(fullBrowserInstallCommand) &&
      stagingRunbook.includes(fullBrowserInstallCommand),
    'Local full-browser documentation must install both supported browsers'
  );
  assertCondition(
    deadCodeDocumentation.includes(
      'Do not use broad file or directory ignores.'
    ) && !JSON.stringify(knipConfiguration).includes('ignoreExports'),
    'Dead-code documentation and Knip configuration must retain narrow exceptions'
  );
  assertCondition(
    packageManifest.private === true &&
      packageManifest.license === 'UNLICENSED' &&
      license.includes(
        'Copyright (c) 2026 Code Studio Australia. All rights reserved.'
      ) &&
      license.includes(
        'does not grant any licence or other right to the software'
      ) &&
      readme.includes('Projex is proprietary software.') &&
      readme.includes('[LICENSE](LICENSE)'),
    'The public repository must retain its explicit proprietary licence status'
  );
}

async function main() {
  await verifyGitignoreCoverage();
  await verifyTrustedProxyClientIpHeaders();
  await verifyNginxRequestLimits();
  await verifyNginxCompression();
  await verifyNginxHttp2Syntax();
  await verifyDeployArtifactDependencyPatches();
  await verifyDeployReleaseIdentity();
  await verifyGithubDeployOidcBoundary();
  await verifyHostPrivilegeBoundaries();
  await verifyMigrationRollbackContract();
  await verifyRepositoryDocumentation();

  const skipped = [];
  for (const check of checks) {
    const result = await verifyFile(check);
    if (result?.skipped) skipped.push(result.reason);
  }
  if (skipped.length > 0) {
    for (const reason of skipped) {
      console.log(`Skipping optional env file check: ${reason}`);
    }
  }
  console.log('Override rationale: docs/dependencies/dependency-overrides.md');
  console.log('Repo security config checks passed.');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unexpected repo security error'
  );
  process.exitCode = 1;
});
