import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { buildHostBootstrapUserDataCommands } from './hostBootstrap.js';

type ProjexInfraStackProps = StackProps & {
  envName: string;
  instanceType: string;
  dbInstanceType: string;
  dbName: string;
  dbUsername: string;
  dbAllocatedStorage: number;
  dbMaxAllocatedStorage?: number;
  dbBackupRetentionDays: number;
  dbMultiAz: boolean;
  sshCidr: string;
  exportBucketName?: string;
};

export class ProjexInfraStack extends Stack {
  constructor(scope: Construct, id: string, props: ProjexInfraStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'ProjexVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'db-isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    const appSg = new ec2.SecurityGroup(this, 'ProjexAppSg', {
      vpc,
      description: 'Projex app server SG',
      allowAllOutbound: true,
    });
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    if (props.sshCidr.trim()) {
      appSg.addIngressRule(
        ec2.Peer.ipv4(props.sshCidr),
        ec2.Port.tcp(22),
        'SSH'
      );
    }

    const dbSg = new ec2.SecurityGroup(this, 'ProjexDbSg', {
      vpc,
      description: 'Projex postgres SG',
      allowAllOutbound: true,
    });
    dbSg.addIngressRule(appSg, ec2.Port.tcp(5432), 'App to Postgres');

    const role = new iam.Role(this, 'ProjexEc2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        ),
      ],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(...buildHostBootstrapUserDataCommands());

    const instance = new ec2.Instance(this, 'ProjexEc2', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: appSg,
      role,
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      httpTokens: ec2.HttpTokens.REQUIRED,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    const eip = new ec2.CfnEIP(this, 'ProjexEip', { domain: 'vpc' });
    new ec2.CfnEIPAssociation(this, 'ProjexEipAssociation', {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    const dbCredentials = rds.Credentials.fromGeneratedSecret(
      props.dbUsername,
      {
        secretName: `projex/${props.envName}/db-credentials`,
      }
    );

    const db = new rds.DatabaseInstance(this, 'ProjexPostgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: new ec2.InstanceType(props.dbInstanceType),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: dbCredentials,
      allocatedStorage: props.dbAllocatedStorage,
      ...(props.dbMaxAllocatedStorage != null
        ? { maxAllocatedStorage: props.dbMaxAllocatedStorage }
        : {}),
      storageEncrypted: true,
      storageType: rds.StorageType.GP3,
      databaseName: props.dbName,
      backupRetention: Duration.days(props.dbBackupRetentionDays),
      deletionProtection: props.envName === 'production',
      removalPolicy:
        props.envName === 'production'
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      deleteAutomatedBackups: props.envName !== 'production',
      multiAz: props.dbMultiAz,
      publiclyAccessible: false,
    });

    const exportBucket = new s3.Bucket(this, 'ProjexExportBucket', {
      bucketName: props.exportBucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy:
        props.envName === 'production'
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== 'production',
      lifecycleRules: [
        {
          id: 'ExpireStaleExports',
          enabled: true,
          expiration: Duration.days(3),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });

    const deployArtifactBucket = new s3.Bucket(
      this,
      'ProjexDeployArtifactBucket',
      {
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        versioned: false,
        removalPolicy:
          props.envName === 'production'
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY,
        autoDeleteObjects: props.envName !== 'production',
        lifecycleRules: [
          {
            id: 'ExpireDeployArtifacts',
            enabled: true,
            expiration: Duration.days(7),
            abortIncompleteMultipartUploadAfter: Duration.days(1),
          },
        ],
      }
    );

    if (db.secret) {
      db.secret.grantRead(role);
    }
    exportBucket.grantReadWrite(role);
    deployArtifactBucket.grantRead(role);

    new CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new CfnOutput(this, 'Ec2InstanceId', { value: instance.instanceId });
    new CfnOutput(this, 'Ec2PublicIp', { value: eip.ref });
    new CfnOutput(this, 'DbEndpointAddress', {
      value: db.dbInstanceEndpointAddress,
    });
    new CfnOutput(this, 'DbEndpointPort', { value: db.dbInstanceEndpointPort });
    new CfnOutput(this, 'DbSecretArn', {
      value: db.secret?.secretArn ?? '',
      description: 'Secrets Manager ARN containing db username/password',
    });
    new CfnOutput(this, 'ExportBucketName', {
      value: exportBucket.bucketName,
      description: 'S3 bucket for company export workbook objects',
    });
    new CfnOutput(this, 'DeployArtifactBucketName', {
      value: deployArtifactBucket.bucketName,
      description: 'S3 bucket for temporary deploy artifact handoff to EC2',
    });
  }
}
