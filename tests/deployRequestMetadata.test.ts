import { describe, expect, test } from 'vitest';

import {
  createDeployRequestMetadata,
  DEPLOYMENT_CONTEXT_MAX_LENGTH,
  SSM_COMMENT_MAX_LENGTH,
} from '../scripts/deploy-request-metadata.mjs';

const gitSha = '5733eea163a6a6e9bf57f623712dee6a4aae0bf1';
const releaseId = 'verified-5733eea163a6-run30453059158-attempt1';

describe('deployment request metadata', () => {
  test('derives a staging reason from a squash-merged PR commit', () => {
    const metadata = createDeployRequestMetadata({
      commitSubject: 'fix: preserve trusted recovery tooling (#34)',
      environment: 'staging',
      gitSha,
      mode: 'promote',
      releaseId,
    });

    expect(metadata).toMatchObject({
      deploymentReason: 'Deploy PR #34 to staging',
      sourceLabel: 'PR #34',
    });
  });

  test('falls back to the short source SHA when no PR suffix exists', () => {
    const metadata = createDeployRequestMetadata({
      commitSubject: 'Routine recovery revision',
      environment: 'production',
      gitSha,
      mode: 'rollback',
      releaseId,
    });

    expect(metadata.deploymentReason).toBe('Rollback 5733eea to production');
    expect(metadata.sourceLabel).toBe('5733eea');
  });

  test('normalizes optional operator context into one auditable line', () => {
    const metadata = createDeployRequestMetadata({
      commitSubject: 'fix: preserve trusted recovery tooling (#34)',
      context: '  Change CHG-42\napproved\tby operations  ',
      environment: 'production',
      gitSha,
      mode: 'promote',
      releaseId,
    });

    expect(metadata.deploymentReason).toBe(
      'Deploy PR #34 to production: Change CHG-42 approved by operations'
    );
  });

  test('bounds the complete rendered SSM comment to the AWS limit', () => {
    const metadata = createDeployRequestMetadata({
      commitSubject: 'fix: preserve trusted recovery tooling (#34)',
      context:
        'This deliberately long context previously caused AWS SendCommand validation to reject the complete rendered comment.',
      environment: 'staging',
      gitSha,
      mode: 'promote',
      releaseId,
    });

    expect(Array.from(metadata.ssmComment)).toHaveLength(
      SSM_COMMENT_MAX_LENGTH
    );
    expect(metadata.ssmComment).toMatch(
      /^Projex promote verified-5733eea163a6-run30453059158-attempt1:/u
    );
    expect(metadata.ssmComment).not.toMatch(/[\r\n]/u);
  });

  test('rejects excessive context instead of silently accepting unbounded input', () => {
    expect(() =>
      createDeployRequestMetadata({
        commitSubject: 'fix: preserve trusted recovery tooling (#34)',
        context: 'x'.repeat(DEPLOYMENT_CONTEXT_MAX_LENGTH + 1),
        environment: 'staging',
        gitSha,
        mode: 'promote',
        releaseId,
      })
    ).toThrow(
      `Deployment context must not exceed ${DEPLOYMENT_CONTEXT_MAX_LENGTH} characters.`
    );
  });
});
