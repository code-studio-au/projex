import { S3Client } from '@aws-sdk/client-s3';

import { AppError } from '../../api/errors.ts';

const DEFAULT_EXPORT_PREFIX = 'company-exports';

export type ExportStorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  keyPrefix: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: ExportStorageConfig | null = null;

function trimEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function parseBooleanEnv(name: string) {
  return trimEnv(name)?.toLowerCase() === 'true';
}

export function requireExportStorageConfig(): ExportStorageConfig {
  if (cachedConfig) return cachedConfig;

  const bucket = trimEnv('S3_BUCKET');
  const region = trimEnv('S3_REGION');
  const endpoint = trimEnv('S3_ENDPOINT') ?? undefined;
  const accessKeyId = trimEnv('S3_ACCESS_KEY_ID') ?? undefined;
  const secretAccessKey = trimEnv('S3_SECRET_ACCESS_KEY') ?? undefined;
  const keyPrefix = trimEnv('S3_EXPORT_PREFIX') ?? DEFAULT_EXPORT_PREFIX;

  if (!bucket || !region) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Export storage is not configured. Set S3_BUCKET and S3_REGION.'
    );
  }

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Export storage credentials are incomplete.'
    );
  }

  cachedConfig = {
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parseBooleanEnv('S3_FORCE_PATH_STYLE'),
    keyPrefix,
  };

  return cachedConfig;
}

export function getExportStorageClient() {
  if (cachedClient) return cachedClient;

  const config = requireExportStorageConfig();
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
  });

  return cachedClient;
}
