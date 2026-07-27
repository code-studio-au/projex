import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export class ProjexGithubIdentityStack extends Stack {
  readonly provider: iam.IOpenIdConnectProvider;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const providerResource = new iam.CfnOIDCProvider(
      this,
      'GithubActionsOidcProvider',
      {
        url: 'https://token.actions.githubusercontent.com',
        clientIdList: ['sts.amazonaws.com'],
      }
    );
    this.provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubActionsOidcProviderReference',
      providerResource.ref
    );

    new CfnOutput(this, 'GithubActionsOidcProviderArn', {
      value: this.provider.openIdConnectProviderArn,
      description:
        'Account-wide GitHub Actions OIDC provider used by Projex deploy roles',
    });
  }
}
