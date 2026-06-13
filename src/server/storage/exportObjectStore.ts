import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';

import { AppError } from '../../api/errors.ts';
import type { CompanyExportJobId } from '../../types/index.ts';

const DEFAULT_EXPORT_PREFIX = 'company-exports';

type ExportStorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  keyPrefix: string;
};

export type StoredExportObject = {
  bucket: string;
  key: string;
  etag?: string;
  contentType: string;
  sizeBytes: number;
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

function requireExportStorageConfig(): ExportStorageConfig {
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

function getExportStorageClient() {
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

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function normalizeEtag(value: string | undefined) {
  return value?.replace(/^"+|"+$/g, '') || undefined;
}

function buildObjectKey(args: { jobId: CompanyExportJobId; fileName: string }) {
  const config = requireExportStorageConfig();
  const requestedOn = new Date().toISOString().slice(0, 10);
  return `${config.keyPrefix}/${requestedOn}/${args.jobId}/${sanitizeFileName(args.fileName)}`;
}

async function bodyToBytes(body: unknown): Promise<Uint8Array> {
  if (!body) {
    throw new AppError('NOT_FOUND', 'Export file is unavailable');
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToByteArray' in body &&
    typeof body.transformToByteArray === 'function'
  ) {
    return new Uint8Array(await body.transformToByteArray());
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    Symbol.asyncIterator in body
  ) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<
      Uint8Array | Buffer | string
    >) {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else {
        chunks.push(new Uint8Array(chunk));
      }
    }

    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  throw new AppError('NOT_FOUND', 'Export file is unavailable');
}

export async function putCompanyExportObject(args: {
  jobId: CompanyExportJobId;
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<StoredExportObject> {
  const config = requireExportStorageConfig();
  const client = getExportStorageClient();
  const key = buildObjectKey({ jobId: args.jobId, fileName: args.fileName });

  const response = await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: args.bytes,
      ContentType: args.contentType,
      ContentDisposition: `attachment; filename="${args.fileName}"`,
      Metadata: {
        exportJobId: args.jobId,
      },
    })
  );

  return {
    bucket: config.bucket,
    key,
    etag: normalizeEtag(response.ETag),
    contentType: args.contentType,
    sizeBytes: args.bytes.byteLength,
  };
}

export async function getCompanyExportObject(args: {
  bucket: string;
  key: string;
}): Promise<StoredExportObject & { bytes: Uint8Array }> {
  const client = getExportStorageClient();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: args.bucket,
        Key: args.key,
      })
    );

    return {
      bucket: args.bucket,
      key: args.key,
      etag: normalizeEtag(response.ETag),
      contentType:
        response.ContentType ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes:
        typeof response.ContentLength === 'number' ? response.ContentLength : 0,
      bytes: await bodyToBytes(response.Body),
    };
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)
    ) {
      throw new AppError('NOT_FOUND', 'Export file is unavailable');
    }
    throw error;
  }
}

export async function deleteCompanyExportObject(args: {
  bucket: string;
  key: string;
}) {
  const client = getExportStorageClient();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: args.bucket,
        Key: args.key,
      })
    );
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)
    ) {
      return;
    }
    throw error;
  }
}
