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
import type { Construct } from 'constructs';

type ProjexInfraStackProps = StackProps & {
  envName: string;
  instanceType: string;
  dbName: string;
  dbUsername: string;
  sshCidr: string;
};

export class ProjexInfraStack extends Stack {
  constructor(scope: Construct, id: string, props: ProjexInfraStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'ProjexVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'app-private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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
      appSg.addIngressRule(ec2.Peer.ipv4(props.sshCidr), ec2.Port.tcp(22), 'SSH');
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
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf update -y || yum update -y',
      'dnf install -y git nginx || yum install -y git nginx',
      'curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -',
      'dnf install -y nodejs || yum install -y nodejs',
      'systemctl enable nginx',
      'systemctl start nginx',
      'echo "Projex instance bootstrap complete" > /var/log/projex-bootstrap.log'
    );

    const instance = new ec2.Instance(this, 'ProjexEc2', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: appSg,
      role,
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(40, {
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

    const dbCredentials = rds.Credentials.fromGeneratedSecret(props.dbUsername, {
      secretName: `projex/${props.envName}/db-credentials`,
    });

    const db = new rds.DatabaseInstance(this, 'ProjexPostgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: dbCredentials,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      databaseName: props.dbName,
      backupRetention: Duration.days(props.envName === 'production' ? 7 : 1),
      deletionProtection: props.envName === 'production',
      removalPolicy:
        props.envName === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      deleteAutomatedBackups: props.envName !== 'production',
      multiAz: props.envName === 'production',
      publiclyAccessible: false,
    });

    new CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new CfnOutput(this, 'Ec2InstanceId', { value: instance.instanceId });
    new CfnOutput(this, 'Ec2PublicIp', { value: eip.ref });
    new CfnOutput(this, 'DbEndpointAddress', { value: db.dbInstanceEndpointAddress });
    new CfnOutput(this, 'DbEndpointPort', { value: db.dbInstanceEndpointPort });
    new CfnOutput(this, 'DbSecretArn', {
      value: db.secret?.secretArn ?? '',
      description: 'Secrets Manager ARN containing db username/password',
    });
  }
}
