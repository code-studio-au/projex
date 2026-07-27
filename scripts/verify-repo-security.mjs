import { readFile } from 'node:fs/promises';

const optionalDeploymentEnvPaths = ['.env.production', '.env.staging'];
const nginxProxyConfigPaths = [
  'deploy/nginx/projex.bootstrap.conf',
  'deploy/nginx/projex.conf',
  'deploy/nginx/projex.https.conf.template',
];
const nginxRequestLimitsPath = 'deploy/nginx/projex-request-limits.conf';
const nginxImportBodyLimit = 'client_max_body_size 16m;';
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
    createArtifactScript.includes(`require_path "${nginxRequestLimitsPath}"`),
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
    createArtifactScript.includes(`require_path "${braceExpansionPatchPath}"`),
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
  const [workflow, createArtifactScript, ssmScript, ec2Script] =
    await Promise.all([
      readFile('.github/workflows/deploy.yml', 'utf8'),
      readFile('scripts/create-deploy-artifact.sh', 'utf8'),
      readFile('scripts/deploy-artifact-ssm.sh', 'utf8'),
      readFile('scripts/deploy-artifact-ec2.sh', 'utf8'),
    ]);

  assertCondition(
    workflow.includes('COMMIT_SHA="$(git rev-parse HEAD)"') &&
      workflow.includes('ref: ${{ needs.build-artifact.outputs.commit-sha }}'),
    'Deploy build and activation jobs must share the resolved immutable checkout SHA'
  );
  assertCondition(
    workflow.includes('GITHUB_RUN_ID') &&
      workflow.includes('GITHUB_RUN_ATTEMPT') &&
      workflow.includes('artifact_sha256'),
    'Physical deploy identity must include the workflow run and verified artifact checksum'
  );
  assertCondition(
    createArtifactScript.includes('.projex-release.json') &&
      createArtifactScript.includes('"gitSha": "%s"') &&
      createArtifactScript.includes('"runAttempt": "%s"'),
    'Deploy artifacts must embed their immutable release manifest'
  );
  assertCondition(
    ssmScript.includes(
      'mktemp -d "${RELEASES_DIR}/.${RELEASE_ID}.staging.XXXXXX"'
    ) &&
      ssmScript.includes(
        '\'require("node:fs").renameSync(process.argv[1], process.argv[2])\''
      ) &&
      !ssmScript.includes('rm -rf "$RELEASE_DIR"'),
    'SSM deploys must validate in a fresh staging directory and atomically promote without deleting a release'
  );
  assertCondition(
    ec2Script.includes('active_release_dir="$(current_release_dir') &&
      ec2Script.includes('activate_release "$RELEASE_DIR"') &&
      ec2Script.includes('rm -rf -- "$dir"'),
    'Release activation and pruning must preserve the active release'
  );
}

async function verifyGithubDeployOidcBoundary() {
  const [workflow, cdkApp, identityStack, deployStack] = await Promise.all([
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('deploy/cdk/bin/projex-infra.ts', 'utf8'),
    readFile('deploy/cdk/lib/projex-github-identity-stack.ts', 'utf8'),
    readFile('deploy/cdk/lib/projex-github-deploy-stack.ts', 'utf8'),
  ]);

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
      identityStack.includes('token.actions.githubusercontent.com') &&
      identityStack.includes("clientIdList: ['sts.amazonaws.com']"),
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

async function main() {
  await verifyGitignoreCoverage();
  await verifyTrustedProxyClientIpHeaders();
  await verifyNginxRequestLimits();
  await verifyDeployArtifactDependencyPatches();
  await verifyDeployReleaseIdentity();
  await verifyGithubDeployOidcBoundary();

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
  console.log('Override rationale: docs/dependency-overrides.md');
  console.log('Repo security config checks passed.');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unexpected repo security error'
  );
  process.exitCode = 1;
});
