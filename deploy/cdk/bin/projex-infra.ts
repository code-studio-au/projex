#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { ProjexGithubDeployStack } from '../lib/projex-github-deploy-stack.js';
import { ProjexGithubIdentityStack } from '../lib/projex-github-identity-stack.js';
import { ProjexInfraStack } from '../lib/projex-infra-stack.js';
import { ProjexSecurityChecks } from '../lib/projex-security-checks.js';

const app = new cdk.App();
cdk.Validations.of(app).addPlugins(
  new ProjexSecurityChecks(app, { verbose: true })
);

function readOptionalPositiveIntContext(key: string) {
  const raw = app.node.tryGetContext(key);
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Context ${key} must be a positive integer.`);
  }
  return value;
}

function readBooleanContext(key: string, fallback: boolean) {
  const raw = app.node.tryGetContext(key);
  if (raw == null || raw === '') return fallback;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  throw new Error(`Context ${key} must be true or false.`);
}

const envName = String(app.node.tryGetContext('envName') ?? 'staging');
if (envName !== 'staging' && envName !== 'production') {
  throw new Error('Context envName must be staging or production.');
}
const githubRepository = String(
  app.node.tryGetContext('githubRepository') ?? 'code-studio-au/projex'
);
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository)) {
  throw new Error('Context githubRepository must use owner/repository format.');
}
const instanceType = app.node.tryGetContext('instanceType') ?? 't4g.small';
const dbInstanceType = app.node.tryGetContext('dbInstanceType') ?? 't4g.micro';
const dbName = app.node.tryGetContext('dbName') ?? 'projex';
const dbUsername = app.node.tryGetContext('dbUsername') ?? 'projex_app';
const dbAllocatedStorage =
  readOptionalPositiveIntContext('dbAllocatedStorage') ?? 20;
const dbMaxAllocatedStorage = readOptionalPositiveIntContext(
  'dbMaxAllocatedStorage'
);
const dbBackupRetentionDays =
  readOptionalPositiveIntContext('dbBackupRetentionDays') ?? 1;
const dbMultiAz = readBooleanContext('dbMultiAz', false);
const sshCidr = app.node.tryGetContext('sshCidr') ?? '';
const exportBucketName = app.node.tryGetContext('exportBucketName');
const deployInstanceId = String(
  app.node.tryGetContext('deployInstanceId') ?? ''
).trim();
const deployArtifactBucketName = String(
  app.node.tryGetContext('deployArtifactBucketName') ?? ''
).trim();
if (
  (deployInstanceId && !deployArtifactBucketName) ||
  (!deployInstanceId && deployArtifactBucketName)
) {
  throw new Error(
    'Contexts deployInstanceId and deployArtifactBucketName must be provided together.'
  );
}
if (deployInstanceId && !/^i-[0-9a-f]{8,17}$/.test(deployInstanceId)) {
  throw new Error('Context deployInstanceId must be a valid EC2 instance ID.');
}
if (
  deployArtifactBucketName &&
  !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(deployArtifactBucketName)
) {
  throw new Error(
    'Context deployArtifactBucketName must be a valid S3 bucket name.'
  );
}
const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const githubIdentity = new ProjexGithubIdentityStack(
  app,
  'ProjexGithubIdentity',
  {
    env: stackEnv,
    description:
      'Account-wide GitHub Actions OIDC identity provider for Projex deploys',
  }
);

new ProjexInfraStack(app, `ProjexInfra-${envName}`, {
  env: stackEnv,
  envName,
  instanceType,
  dbInstanceType,
  dbName,
  dbUsername,
  dbAllocatedStorage,
  dbMaxAllocatedStorage,
  dbBackupRetentionDays,
  dbMultiAz,
  sshCidr: String(sshCidr || ''),
  exportBucketName:
    typeof exportBucketName === 'string' && exportBucketName.trim()
      ? exportBucketName.trim()
      : undefined,
});

if (deployInstanceId && deployArtifactBucketName) {
  const githubDeploy = new ProjexGithubDeployStack(
    app,
    `ProjexGithubDeploy-${envName}`,
    {
      env: stackEnv,
      envName,
      githubRepository,
      githubOidcProvider: githubIdentity.provider,
      instanceId: deployInstanceId,
      artifactBucketName: deployArtifactBucketName,
      description: `GitHub Actions OIDC deployment role for Projex ${envName}`,
    }
  );
  githubDeploy.addDependency(githubIdentity);
}
