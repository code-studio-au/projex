#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { ProjexInfraStack } from '../lib/projex-infra-stack.js';

const app = new cdk.App();

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

const envName = app.node.tryGetContext('envName') ?? 'staging';
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

new ProjexInfraStack(app, `ProjexInfra-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
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
