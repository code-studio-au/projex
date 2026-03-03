#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { ProjexInfraStack } from '../lib/projex-infra-stack.js';

const app = new cdk.App();

const envName = app.node.tryGetContext('envName') ?? 'staging';
const instanceType = app.node.tryGetContext('instanceType') ?? 't3.small';
const dbName = app.node.tryGetContext('dbName') ?? 'projex';
const dbUsername = app.node.tryGetContext('dbUsername') ?? 'projex_app';
const sshCidr = app.node.tryGetContext('sshCidr') ?? '';

new ProjexInfraStack(app, `ProjexInfra-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  envName,
  instanceType,
  dbName,
  dbUsername,
  sshCidr: String(sshCidr || ''),
});
