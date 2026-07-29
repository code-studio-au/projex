import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEPLOYMENT_CONTEXT_MAX_LENGTH = 160;
export const SSM_COMMENT_MAX_LENGTH = 100;

function requireValue(label, value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function truncateCharacters(value, maximumLength) {
  return Array.from(value).slice(0, maximumLength).join('');
}

export function createDeployRequestMetadata({
  commitSubject,
  context = '',
  environment,
  gitSha,
  mode,
  releaseId,
}) {
  const normalizedSubject = requireValue(
    'Commit subject',
    commitSubject,
    /\S/u
  ).trim();
  const normalizedEnvironment = requireValue(
    'Deployment environment',
    environment,
    /^(?:staging|production)$/u
  );
  const normalizedGitSha = requireValue(
    'Release Git SHA',
    gitSha,
    /^[0-9a-f]{40}$/u
  );
  const normalizedMode = requireValue(
    'Deployment mode',
    mode,
    /^(?:promote|rollback)$/u
  );
  const normalizedReleaseId = requireValue(
    'Release ID',
    releaseId,
    /^[a-z0-9][a-z0-9.-]{0,127}$/u
  );
  const normalizedContext = String(context).replace(/\s+/gu, ' ').trim();
  if (Array.from(normalizedContext).length > DEPLOYMENT_CONTEXT_MAX_LENGTH) {
    throw new Error(
      `Deployment context must not exceed ${DEPLOYMENT_CONTEXT_MAX_LENGTH} characters.`
    );
  }

  const pullRequestMatch = normalizedSubject.match(/\(#([1-9][0-9]*)\)\s*$/u);
  const sourceLabel = pullRequestMatch
    ? `PR #${pullRequestMatch[1]}`
    : normalizedGitSha.slice(0, 7);
  const action = normalizedMode === 'rollback' ? 'Rollback' : 'Deploy';
  const baseReason = `${action} ${sourceLabel} to ${normalizedEnvironment}`;
  const deploymentReason = normalizedContext
    ? `${baseReason}: ${normalizedContext}`
    : baseReason;
  const ssmComment = truncateCharacters(
    `Projex ${normalizedMode} ${normalizedReleaseId}: ${deploymentReason}`,
    SSM_COMMENT_MAX_LENGTH
  );

  return {
    deploymentReason,
    sourceLabel,
    ssmComment,
  };
}

async function runCli() {
  const metadata = createDeployRequestMetadata({
    commitSubject: process.env.DEPLOY_COMMIT_SUBJECT,
    context: process.env.DEPLOYMENT_CONTEXT,
    environment: process.env.DEPLOY_ENVIRONMENT,
    gitSha: process.env.EXPECTED_GIT_SHA,
    mode: process.env.DEPLOY_MODE,
    releaseId: process.env.RELEASE_ID,
  });

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `deployment_reason=${metadata.deploymentReason}\n` +
        `source_label=${metadata.sourceLabel}\n` +
        `ssm_comment=${metadata.ssmComment}\n`
    );
  }
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  runCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
