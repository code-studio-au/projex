import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test } from 'vitest';

import { EC2_USER_DATA_MAX_BYTES } from '../lib/hostBootstrap.ts';
import { ProjexInfraStack } from '../lib/projex-infra-stack.ts';

type EnvironmentName = 'production' | 'staging';

function synthesizeInfraTemplate(
  envName: EnvironmentName,
  options: {
    backupRetentionDays?: number;
    dbMultiAz?: boolean;
    sshCidr?: string;
  } = {}
) {
  const app = new App();
  const stack = new ProjexInfraStack(app, `TestProjexInfra-${envName}`, {
    env: {
      account: '111122223333',
      region: 'ap-southeast-2',
    },
    envName,
    instanceType: 't4g.small',
    dbInstanceType: 't4g.micro',
    dbName: 'projex',
    dbUsername: 'projex_app',
    dbAllocatedStorage: 20,
    dbBackupRetentionDays: options.backupRetentionDays ?? 1,
    dbMultiAz: options.dbMultiAz ?? false,
    sshCidr: options.sshCidr ?? '',
  });
  return Template.fromStack(stack);
}

function onlyResource(template: Template, resourceType: string) {
  const resources = Object.values(template.findResources(resourceType));
  expect(resources).toHaveLength(1);
  return resources[0] as {
    DeletionPolicy?: string;
    Properties?: Record<string, unknown>;
    UpdateReplacePolicy?: string;
  };
}

describe('Projex infrastructure security', () => {
  test('requires IMDSv2 and an encrypted root volume', () => {
    const template = synthesizeInfraTemplate('staging');

    template.hasResourceProperties('AWS::EC2::Instance', {
      BlockDeviceMappings: [
        {
          DeviceName: '/dev/xvda',
          Ebs: {
            Encrypted: true,
            VolumeSize: 20,
            VolumeType: 'gp3',
          },
        },
      ],
      MetadataOptions: {
        HttpTokens: 'required',
      },
    });
  });

  test('keeps rendered bootstrap data within the EC2 API limit', () => {
    const template = synthesizeInfraTemplate('staging');
    const instance = onlyResource(template, 'AWS::EC2::Instance');
    const userData = instance.Properties?.UserData as
      | { 'Fn::Base64'?: unknown }
      | undefined;
    const renderedUserData = userData?.['Fn::Base64'];

    expect(renderedUserData).toEqual(expect.any(String));
    expect(
      Buffer.byteLength(String(renderedUserData), 'utf8')
    ).toBeLessThanOrEqual(EC2_USER_DATA_MAX_BYTES);
    expect(renderedUserData).toContain(
      'base64 --decode | gzip --decompress | /bin/bash'
    );
  });

  test('exposes only HTTP and HTTPS publicly when SSH is disabled', () => {
    const template = synthesizeInfraTemplate('staging');
    const securityGroups = Object.values(
      template.findResources('AWS::EC2::SecurityGroup')
    ) as Array<{ Properties?: Record<string, unknown> }>;
    const applicationGroup = securityGroups.find(
      ({ Properties: properties }) =>
        properties?.GroupDescription === 'Projex app server SG'
    );

    expect(applicationGroup).toBeDefined();
    expect(applicationGroup?.Properties?.SecurityGroupIngress).toEqual([
      {
        CidrIp: '0.0.0.0/0',
        Description: 'HTTP',
        FromPort: 80,
        IpProtocol: 'tcp',
        ToPort: 80,
      },
      {
        CidrIp: '0.0.0.0/0',
        Description: 'HTTPS',
        FromPort: 443,
        IpProtocol: 'tcp',
        ToPort: 443,
      },
    ]);
    expect(JSON.stringify(template.toJSON())).not.toContain('"FromPort":22');
  });

  test('keeps staging RDS encrypted, private, isolated, backed up, and disposable', () => {
    const template = synthesizeInfraTemplate('staging', {
      backupRetentionDays: 3,
    });

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 3,
      DeleteAutomatedBackups: true,
      DeletionProtection: false,
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      StorageType: 'gp3',
    });
    template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {
      SubnetIds: Match.arrayWith([
        Match.objectLike({
          Ref: Match.stringLikeRegexp('dbisolatedSubnet1'),
        }),
        Match.objectLike({
          Ref: Match.stringLikeRegexp('dbisolatedSubnet2'),
        }),
      ]),
    });

    const database = onlyResource(template, 'AWS::RDS::DBInstance');
    expect(database.DeletionPolicy).toBe('Delete');
    expect(database.UpdateReplacePolicy).toBe('Delete');
  });

  test('retains and protects the production database and buckets', () => {
    const template = synthesizeInfraTemplate('production', {
      backupRetentionDays: 14,
      dbMultiAz: true,
    });

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 14,
      DeleteAutomatedBackups: false,
      DeletionProtection: true,
      MultiAZ: true,
      PubliclyAccessible: false,
      StorageEncrypted: true,
    });
    const database = onlyResource(template, 'AWS::RDS::DBInstance');
    expect(database.DeletionPolicy).toBe('Retain');
    expect(database.UpdateReplacePolicy).toBe('Retain');

    template.resourceCountIs('AWS::S3::Bucket', 2);
    template.allResourcesProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    for (const bucket of Object.values(
      template.findResources('AWS::S3::Bucket')
    ) as Array<{
      DeletionPolicy?: string;
      UpdateReplacePolicy?: string;
    }>) {
      expect(bucket.DeletionPolicy).toBe('Retain');
      expect(bucket.UpdateReplacePolicy).toBe('Retain');
    }
  });
});
