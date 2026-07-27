import { readFile } from 'node:fs/promises';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test } from 'vitest';

import { ProjexGithubDeployStack } from '../lib/projex-github-deploy-stack.ts';
import { ProjexGithubIdentityStack } from '../lib/projex-github-identity-stack.ts';

const awsEnv = {
  account: '111122223333',
  region: 'ap-southeast-2',
};

function synthesizeTemplates(envName = 'staging') {
  const app = new App();
  const identity = new ProjexGithubIdentityStack(app, 'TestGithubIdentity', {
    env: awsEnv,
  });
  const deploy = new ProjexGithubDeployStack(app, 'TestGithubDeploy', {
    env: awsEnv,
    envName,
    githubRepository: 'code-studio-au/projex',
    githubOidcProvider: identity.provider,
    instanceId: 'i-0123456789abcdef0',
    artifactBucketName: 'projex-deploy-artifacts-test',
  });
  deploy.addDependency(identity);

  return {
    identity: Template.fromStack(identity).toJSON(),
    deploy: Template.fromStack(deploy).toJSON(),
  };
}

type CfnResource = {
  Properties?: Record<string, unknown>;
  Type?: string;
};

function findResourceByDescription(
  template: Record<string, unknown>,
  type: string,
  description: string
) {
  const resources = template.Resources as Record<string, CfnResource>;
  return Object.entries(resources).find(
    ([, resource]) =>
      resource.Type === type && resource.Properties?.Description === description
  );
}

describe('GitHub deploy identity', () => {
  test('provisions the account-wide GitHub Actions OIDC provider', () => {
    const { identity } = synthesizeTemplates();
    const resources = identity.Resources as Record<string, CfnResource>;
    const providers = Object.values(resources).filter(
      (resource) => resource.Type === 'AWS::IAM::OIDCProvider'
    );

    expect(providers).toHaveLength(1);
    expect(providers[0]?.Properties).toMatchObject({
      ClientIdList: ['sts.amazonaws.com'],
      Url: 'https://token.actions.githubusercontent.com',
    });
  });

  test('trusts only the protected GitHub environment identity', () => {
    const { deploy } = synthesizeTemplates('staging');
    const roleEntry = findResourceByDescription(
      deploy,
      'AWS::IAM::Role',
      'GitHub Actions staging deploy role for code-studio-au/projex'
    );
    const role = roleEntry?.[1];

    expect(role).toBeDefined();
    expect(role?.Properties?.AssumeRolePolicyDocument).toMatchObject({
      Statement: [
        {
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub':
                'repo:code-studio-au/projex:environment:staging',
            },
          },
          Effect: 'Allow',
        },
      ],
    });
  });

  test('limits deploy access to artifact upload and the target instance', () => {
    const { deploy } = synthesizeTemplates('staging');
    const resources = deploy.Resources as Record<string, CfnResource>;
    const roleEntry = findResourceByDescription(
      deploy,
      'AWS::IAM::Role',
      'GitHub Actions staging deploy role for code-studio-au/projex'
    );
    expect(roleEntry).toBeDefined();
    const roleLogicalId = roleEntry?.[0] ?? '';
    const deployPolicy = Object.values(resources).find(
      (resource) =>
        resource.Type === 'AWS::IAM::Policy' &&
        JSON.stringify(resource.Properties?.Roles).includes(roleLogicalId)
    );
    expect(deployPolicy).toBeDefined();

    const policyDocument = deployPolicy?.Properties?.PolicyDocument as {
      Statement: Array<{
        Action: string | string[];
        Resource: unknown;
      }>;
    };
    const statementFor = (action: string) =>
      policyDocument.Statement.find((statement) =>
        (Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action]
        ).includes(action)
      );
    const s3Statement = statementFor('s3:PutObject');
    const sendCommandStatement = statementFor('ssm:SendCommand');
    const getInvocationStatement = statementFor('ssm:GetCommandInvocation');

    expect(s3Statement?.Action).toEqual([
      's3:PutObject',
      's3:AbortMultipartUpload',
      's3:ListMultipartUploadParts',
    ]);
    expect(JSON.stringify(s3Statement?.Resource)).toContain(
      'deploy-artifacts/staging/*'
    );
    expect(sendCommandStatement?.Action).toBe('ssm:SendCommand');
    expect(JSON.stringify(sendCommandStatement?.Resource)).toContain(
      'AWS-RunShellScript'
    );
    expect(JSON.stringify(sendCommandStatement?.Resource)).toContain(
      'i-0123456789abcdef0'
    );
    expect(getInvocationStatement).toMatchObject({
      Action: 'ssm:GetCommandInvocation',
      Resource: '*',
    });
    expect(JSON.stringify(policyDocument)).not.toMatch(/"(?:s3|ssm):\*"/);
  });

  test('requires OIDC and contains no static AWS credential fallback', async () => {
    const workflow = await readFile(
      new URL('../../../.github/workflows/deploy.yml', import.meta.url),
      'utf8'
    );

    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('vars.AWS_DEPLOY_ROLE_ARN');
    expect(workflow).toContain('Configure AWS credentials from GitHub OIDC');
    expect(workflow).not.toContain('secrets.AWS_ACCESS_KEY_ID');
    expect(workflow).not.toContain('secrets.AWS_SECRET_ACCESS_KEY');
    expect(workflow).not.toContain('aws-access-key-id:');
    expect(workflow).not.toContain('aws-secret-access-key:');
  });
});
