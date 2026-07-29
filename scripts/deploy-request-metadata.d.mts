export declare const DEPLOYMENT_CONTEXT_MAX_LENGTH: number;
export declare const SSM_COMMENT_MAX_LENGTH: number;

export type DeployRequestMetadata = {
  deploymentReason: string;
  sourceLabel: string;
  ssmComment: string;
};

export declare function createDeployRequestMetadata(input: {
  commitSubject: string;
  context?: string;
  environment: 'production' | 'staging';
  gitSha: string;
  mode: 'promote' | 'rollback';
  releaseId: string;
}): DeployRequestMetadata;
