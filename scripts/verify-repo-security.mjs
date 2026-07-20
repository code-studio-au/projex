import { readFile } from 'node:fs/promises';

const optionalDeploymentEnvPaths = ['.env.production', '.env.staging'];
const nginxProxyConfigPaths = [
  'deploy/nginx/projex.bootstrap.conf',
  'deploy/nginx/projex.conf',
  'deploy/nginx/projex.https.conf.template',
];
const nginxRequestLimitsPath = 'deploy/nginx/projex-request-limits.conf';
const nginxImportBodyLimit = 'client_max_body_size 16m;';

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

async function main() {
  await verifyGitignoreCoverage();
  await verifyTrustedProxyClientIpHeaders();
  await verifyNginxRequestLimits();

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
