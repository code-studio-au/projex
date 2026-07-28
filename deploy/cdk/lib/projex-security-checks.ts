import {
  CfnDeletionPolicy,
  CfnResource,
  Stack,
  aws_ec2 as ec2,
  aws_rds as rds,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import {
  NagMessageLevel,
  NagPack,
  type NagPackProps,
  NagRuleCompliance,
  rules,
} from 'cdk-nag';
import type { IConstruct } from 'constructs';

function productionResource(node: CfnResource) {
  return Stack.of(node).stackName.toLowerCase().includes('production');
}

function approvedPublicIngress(node: CfnResource) {
  if (!(node instanceof ec2.CfnSecurityGroup)) {
    return NagRuleCompliance.NOT_APPLICABLE;
  }

  const ingress = (node.securityGroupIngress ?? []) as Array<{
    cidrIp?: string;
    cidrIpv6?: string;
    fromPort?: number;
    ipProtocol?: string;
    toPort?: number;
  }>;
  const hasUnsafePublicIngress = ingress.some((rule) => {
    const isPublic = rule.cidrIp === '0.0.0.0/0' || rule.cidrIpv6 === '::/0';
    if (!isPublic) return false;
    return !(
      rule.ipProtocol === 'tcp' &&
      rule.fromPort === rule.toPort &&
      (rule.fromPort === 80 || rule.fromPort === 443)
    );
  });

  return hasUnsafePublicIngress
    ? NagRuleCompliance.NON_COMPLIANT
    : NagRuleCompliance.COMPLIANT;
}

function encryptedS3Bucket(node: CfnResource) {
  if (!(node instanceof s3.CfnBucket)) {
    return NagRuleCompliance.NOT_APPLICABLE;
  }

  const encryption = Stack.of(node).resolve(node.bucketEncryption) as
    | {
        serverSideEncryptionConfiguration?: Array<{
          serverSideEncryptionByDefault?: { sseAlgorithm?: string };
        }>;
      }
    | undefined;
  const algorithms =
    encryption?.serverSideEncryptionConfiguration?.map(
      (entry) => entry.serverSideEncryptionByDefault?.sseAlgorithm
    ) ?? [];

  return algorithms.some(
    (algorithm) => algorithm === 'AES256' || algorithm === 'aws:kms'
  )
    ? NagRuleCompliance.COMPLIANT
    : NagRuleCompliance.NON_COMPLIANT;
}

function productionRetention(node: CfnResource) {
  if (!productionResource(node)) {
    return NagRuleCompliance.NOT_APPLICABLE;
  }
  if (node instanceof rds.CfnDBInstance) {
    const deletionProtection = Stack.of(node).resolve(node.deletionProtection);
    return deletionProtection === true &&
      node.cfnOptions.deletionPolicy === CfnDeletionPolicy.RETAIN &&
      node.cfnOptions.updateReplacePolicy === CfnDeletionPolicy.RETAIN
      ? NagRuleCompliance.COMPLIANT
      : NagRuleCompliance.NON_COMPLIANT;
  }
  if (node instanceof s3.CfnBucket) {
    return node.cfnOptions.deletionPolicy === CfnDeletionPolicy.RETAIN &&
      node.cfnOptions.updateReplacePolicy === CfnDeletionPolicy.RETAIN
      ? NagRuleCompliance.COMPLIANT
      : NagRuleCompliance.NON_COMPLIANT;
  }
  return NagRuleCompliance.NOT_APPLICABLE;
}

export class ProjexSecurityChecks extends NagPack {
  readonly name = 'ProjexSecurity';
  readonly version = '1.0.0';
  readonly ruleIds = [
    'ProjexSecurity-EC2EncryptedRoot',
    'ProjexSecurity-EC2IMDSv2',
    'ProjexSecurity-PublicIngress',
    'ProjexSecurity-RDSEncrypted',
    'ProjexSecurity-RDSPrivate',
    'ProjexSecurity-S3Encrypted',
    'ProjexSecurity-S3Private',
    'ProjexSecurity-ProductionRetention',
  ];

  constructor(scope?: IConstruct, props?: NagPackProps) {
    super(scope, props);
    this.packName = this.name;
  }

  protected checkResource(node: CfnResource): void {
    this.applyRule({
      ruleSuffixOverride: 'EC2EncryptedRoot',
      info: 'EC2 block devices must be encrypted.',
      explanation: 'Encryption protects application data stored on EBS.',
      level: NagMessageLevel.ERROR,
      node,
      rule: rules.ec2.EC2EBSVolumeEncrypted,
    });
    this.applyRule({
      ruleSuffixOverride: 'EC2IMDSv2',
      info: 'EC2 instances must require IMDSv2.',
      explanation: 'Session-oriented metadata requests reduce SSRF risk.',
      level: NagMessageLevel.ERROR,
      node,
      rule: rules.ec2.EC2IMDSv2Enabled,
    });
    this.applyRule({
      ruleSuffixOverride: 'PublicIngress',
      info: 'Public ingress must be limited to HTTP and HTTPS.',
      explanation: 'Administrative and database ports must remain private.',
      level: NagMessageLevel.ERROR,
      node,
      rule: approvedPublicIngress,
    });
    this.applyRule({
      ruleSuffixOverride: 'RDSEncrypted',
      info: 'RDS storage must be encrypted.',
      explanation: 'Encryption protects persisted application data.',
      level: NagMessageLevel.ERROR,
      node,
      rule: rules.rds.RDSStorageEncrypted,
    });
    this.applyRule({
      ruleSuffixOverride: 'RDSPrivate',
      info: 'RDS instances must not be publicly accessible.',
      explanation: 'The database is reachable only from the application tier.',
      level: NagMessageLevel.ERROR,
      node,
      rule: rules.rds.RDSInstancePublicAccess,
    });
    this.applyRule({
      ruleSuffixOverride: 'S3Encrypted',
      info: 'S3 buckets must enable server-side encryption.',
      explanation: 'Encryption protects deploy artifacts and exports at rest.',
      level: NagMessageLevel.ERROR,
      node,
      rule: encryptedS3Bucket,
    });
    this.applyRule({
      ruleSuffixOverride: 'S3Private',
      info: 'S3 buckets must block public access.',
      explanation: 'Deploy artifacts and exports are private application data.',
      level: NagMessageLevel.ERROR,
      node,
      rule: rules.s3.S3BucketLevelPublicAccessProhibited,
    });
    this.applyRule({
      ruleSuffixOverride: 'ProductionRetention',
      info: 'Production stateful resources must be retained and protected.',
      explanation:
        'Production database and bucket deletion must require deliberate intervention.',
      level: NagMessageLevel.ERROR,
      node,
      rule: productionRetention,
    });
  }
}
