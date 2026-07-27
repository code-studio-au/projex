import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

type ProjexGithubDeployStackProps = StackProps & {
  artifactBucketName: string;
  envName: string;
  githubOidcProvider: iam.IOpenIdConnectProvider;
  githubRepository: string;
  instanceId: string;
};

export class ProjexGithubDeployStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ProjexGithubDeployStackProps
  ) {
    super(scope, id, props);

    const artifactBucket = s3.Bucket.fromBucketName(
      this,
      'DeployArtifactBucket',
      props.artifactBucketName
    );
    const githubDeployRole = new iam.Role(this, 'ProjexGithubDeployRole', {
      assumedBy: new iam.OpenIdConnectPrincipal(props.githubOidcProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepository}:environment:${props.envName}`,
        },
      }),
      description: `GitHub Actions ${props.envName} deploy role for ${props.githubRepository}`,
      maxSessionDuration: Duration.hours(1),
    });
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:PutObject',
          's3:AbortMultipartUpload',
          's3:ListMultipartUploadParts',
        ],
        resources: [
          artifactBucket.arnForObjects(`deploy-artifacts/${props.envName}/*`),
        ],
      })
    );
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:SendCommand'],
        resources: [
          Stack.of(this).formatArn({
            service: 'ec2',
            resource: 'instance',
            resourceName: props.instanceId,
          }),
          Stack.of(this).formatArn({
            service: 'ssm',
            account: '',
            resource: 'document',
            resourceName: 'AWS-RunShellScript',
          }),
        ],
      })
    );
    githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetCommandInvocation'],
        resources: ['*'],
      })
    );

    new CfnOutput(this, 'GithubDeployRoleArn', {
      value: githubDeployRole.roleArn,
      description: `OIDC-only GitHub Actions deploy role for the ${props.envName} environment`,
    });
  }
}
