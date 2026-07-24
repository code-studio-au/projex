import assert from 'node:assert/strict';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { afterEach, test, vi } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { asCompanyExportJobId } from '../src/types/index.ts';

const sendMock = vi.fn();
const getExportStorageClientMock = vi.fn(() => ({ send: sendMock }));
const requireExportStorageConfigMock = vi.fn(() => ({
  bucket: 'projex-exports',
  region: 'ap-southeast-2',
  endpoint: 'http://localhost:9000',
  accessKeyId: 'minio',
  secretAccessKey: 'miniosecret',
  forcePathStyle: true,
  keyPrefix: 'company-exports',
}));

vi.mock('../src/server/storage/exportStorageShared.ts', () => ({
  getExportStorageClient: getExportStorageClientMock,
  requireExportStorageConfig: requireExportStorageConfigMock,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

test('putCompanyExportObject sanitizes filenames, stores metadata, and normalizes etags', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-26T08:30:00.000Z'));
  sendMock.mockResolvedValue({ ETag: '"etag-123"' });

  const { putCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');
  const result = await putCompanyExportObject({
    jobId: asCompanyExportJobId('expjob_1'),
    fileName: 'Acme Delivery Report (Q2).xlsx',
    bytes: new Uint8Array([1, 2, 3]),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  assert.equal(sendMock.mock.calls.length, 1);
  const firstCall = sendMock.mock.calls[0] as [unknown] | undefined;
  const command = firstCall?.[0];
  assert.ok(command instanceof PutObjectCommand);
  assert.deepEqual(command.input, {
    Bucket: 'projex-exports',
    Key: 'company-exports/2026-06-26/expjob_1/Acme-Delivery-Report-Q2-.xlsx',
    Body: new Uint8Array([1, 2, 3]),
    ContentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ContentDisposition: 'attachment; filename="Acme Delivery Report (Q2).xlsx"',
    Metadata: {
      exportJobId: 'expjob_1',
    },
  });
  assert.deepEqual(result, {
    bucket: 'projex-exports',
    key: 'company-exports/2026-06-26/expjob_1/Acme-Delivery-Report-Q2-.xlsx',
    etag: 'etag-123',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 3,
  });
});

test('getCompanyExportObject reads byte-array response bodies directly', async () => {
  sendMock.mockResolvedValue({
    ETag: '"etag-123"',
    ContentType: 'application/octet-stream',
    ContentLength: 4,
    Body: {
      transformToByteArray: async () => Uint8Array.from([10, 20, 30, 40]),
    },
  });

  const { getCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');
  const result = await getCompanyExportObject({
    bucket: 'projex-exports',
    key: 'company-exports/file.xlsx',
  });

  assert.ok(sendMock.mock.calls[0]?.[0] instanceof GetObjectCommand);
  assert.deepEqual(result, {
    bucket: 'projex-exports',
    key: 'company-exports/file.xlsx',
    etag: 'etag-123',
    contentType: 'application/octet-stream',
    sizeBytes: 4,
    bytes: Uint8Array.from([10, 20, 30, 40]),
  });
});

test('getCompanyExportObject assembles async iterable response bodies and defaults missing content metadata', async () => {
  sendMock.mockResolvedValue({
    ETag: undefined,
    ContentType: undefined,
    ContentLength: undefined,
    Body: {
      async *[Symbol.asyncIterator]() {
        yield Uint8Array.from([1, 2]);
        yield '34';
      },
    },
  });

  const { getCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');
  const result = await getCompanyExportObject({
    bucket: 'projex-exports',
    key: 'company-exports/file.xlsx',
  });

  assert.deepEqual(Array.from(result.bytes), [1, 2, 51, 52]);
  assert.equal(
    result.contentType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  assert.equal(result.sizeBytes, 0);
  assert.equal(result.etag, undefined);
});

test('getCompanyExportObject converts missing objects into a not-found app error', async () => {
  sendMock.mockRejectedValue(
    new S3ServiceException({
      name: 'NoSuchKey',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
      message: 'Missing object',
    })
  );

  const { getCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');

  await assert.rejects(
    () =>
      getCompanyExportObject({
        bucket: 'projex-exports',
        key: 'company-exports/missing.xlsx',
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.message, 'Export file is unavailable');
      return true;
    }
  );
});

test('getCompanyExportObject rejects successful responses without a body', async () => {
  sendMock.mockResolvedValue({ Body: undefined });

  const { getCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');

  await assert.rejects(
    () =>
      getCompanyExportObject({
        bucket: 'projex-exports',
        key: 'company-exports/empty.xlsx',
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.message, 'Export file is unavailable');
      return true;
    }
  );
});

test('getCompanyExportObject rejects unsupported response body shapes', async () => {
  const { getCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');

  for (const body of ['not-a-stream', {}]) {
    sendMock.mockResolvedValueOnce({ Body: body });
    await assert.rejects(
      () =>
        getCompanyExportObject({
          bucket: 'projex-exports',
          key: 'company-exports/unsupported.xlsx',
        }),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, 'NOT_FOUND');
        assert.equal(error.message, 'Export file is unavailable');
        return true;
      }
    );
  }
});

test('deleteCompanyExportObject suppresses missing-object deletes and rethrows unexpected S3 errors', async () => {
  const { deleteCompanyExportObject } =
    await import('../src/server/storage/exportObjectStore.ts');

  sendMock.mockRejectedValueOnce(
    new S3ServiceException({
      name: 'NoSuchKey',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
      message: 'Missing object',
    })
  );

  await deleteCompanyExportObject({
    bucket: 'projex-exports',
    key: 'company-exports/missing.xlsx',
  });

  assert.ok(sendMock.mock.calls[0]?.[0] instanceof DeleteObjectCommand);

  const boom = new S3ServiceException({
    name: 'AccessDenied',
    $fault: 'client',
    $metadata: { httpStatusCode: 403 },
    message: 'Denied',
  });
  sendMock.mockRejectedValueOnce(boom);

  await assert.rejects(
    () =>
      deleteCompanyExportObject({
        bucket: 'projex-exports',
        key: 'company-exports/denied.xlsx',
      }),
    (error) => {
      assert.strictEqual(error, boom);
      return true;
    }
  );
});
