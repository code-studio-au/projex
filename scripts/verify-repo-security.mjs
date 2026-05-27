import { readFile } from 'node:fs/promises';

const checks = [
  {
    path: '.env.production',
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
  const content = await readFile(check.path, 'utf8');

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
}

async function main() {
  for (const check of checks) {
    await verifyFile(check);
  }
  console.log('Repo security config checks passed.');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unexpected repo security error'
  );
  process.exitCode = 1;
});
