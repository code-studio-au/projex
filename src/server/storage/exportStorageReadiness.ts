import { HeadBucketCommand, S3ServiceException } from '@aws-sdk/client-s3';

import { AppError } from '../../api/errors.ts';
import {
  getExportStorageClient,
  requireExportStorageConfig,
} from './exportStorageShared.ts';

export type ExportStorageReadiness = {
  bucket: string;
  keyPrefix: string;
};

export async function checkCompanyExportStorageReady(): Promise<ExportStorageReadiness> {
  const config = requireExportStorageConfig();
  const client = getExportStorageClient();

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: config.bucket,
      })
    );
  } catch (error) {
    if (error instanceof S3ServiceException) {
      throw new AppError(
        'INTERNAL_ERROR',
        `Export storage is unavailable for bucket ${config.bucket}.`
      );
    }
    throw error;
  }

  return {
    bucket: config.bucket,
    keyPrefix: config.keyPrefix,
  };
}
