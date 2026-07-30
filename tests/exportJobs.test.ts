import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import {
  asCompanyExportJobId,
  asCompanyId,
  asUserId,
} from '../src/types/index.ts';

const getCompanyExportObjectMock = vi.fn();
const putCompanyExportObjectMock = vi.fn();
const deleteCompanyExportObjectMock = vi.fn();
const exportCompanyWorkbookForUserMock = vi.fn();
const sendCompanyExportReadyEmailMock = vi.fn();
const buildCompanyExportReadyUrlMock = vi.fn(() => null);
const requireAuthorizedMock = vi.fn();
const requireServerUserIdMock = vi.fn(async () => asUserId('usr_1'));
const assertContextProvidedMock = vi.fn();
const withServerBoundaryMock = vi.fn(async (fn: () => Promise<unknown>) =>
  fn()
);
const enforceRateLimitMock = vi.fn();

let currentDb:
  | ReturnType<typeof createMockDb>
  | ReturnType<typeof createRunnerDb>;
const getDbMock = vi.fn(() => currentDb);

vi.mock('../src/server/storage/exportObjectStore.ts', () => ({
  getCompanyExportObject: getCompanyExportObjectMock,
  putCompanyExportObject: putCompanyExportObjectMock,
  deleteCompanyExportObject: deleteCompanyExportObjectMock,
}));

vi.mock('../src/server/fns/exports.ts', () => ({
  exportCompanyWorkbookForUser: exportCompanyWorkbookForUserMock,
}));

vi.mock('../src/server/notifications/exportNotifications.ts', () => ({
  sendCompanyExportReadyEmail: sendCompanyExportReadyEmailMock,
  buildCompanyExportReadyUrl: buildCompanyExportReadyUrlMock,
}));

vi.mock('../src/server/auth/authorize.ts', () => ({
  requireAuthorized: requireAuthorizedMock,
}));

vi.mock('../src/server/fns/runtime.ts', () => ({
  requireServerUserId: requireServerUserIdMock,
  assertContextProvided: assertContextProvidedMock,
  withServerBoundary: withServerBoundaryMock,
}));

vi.mock('../src/server/rateLimit.ts', () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock('../src/server/db/db.ts', () => ({
  getDb: getDbMock,
}));

type ExportJobRow = {
  id: string;
  company_id: string;
  created_by_user_id: string;
  scope: 'all' | 'active';
  detail: 'summary' | 'full';
  status: 'queued' | 'running' | 'completed' | 'failed';
  file_name: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  storage_bucket: string | null;
  storage_key: string | null;
  storage_etag: string | null;
  error_message: string | null;
  from_date: string | null;
  to_date: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  expires_at: string | null;
  notify_when_ready: boolean;
  notify_email: string | null;
  ready_notification_status: 'pending' | 'sent' | 'failed' | 'not_requested';
  ready_notification_delivery: 'email' | null;
  ready_notification_sent_at: string | null;
  ready_notification_error: string | null;
  last_heartbeat_at: string | null;
  updated_at: string;
};

function buildRow(overrides: Partial<ExportJobRow> = {}): ExportJobRow {
  return {
    id: 'expjob_1',
    company_id: 'co_1',
    created_by_user_id: 'usr_1',
    scope: 'all',
    detail: 'full',
    status: 'completed',
    file_name: 'acme-export.xlsx',
    content_type:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size_bytes: 123,
    storage_bucket: 'exports',
    storage_key: 'co_1/expjob_1.xlsx',
    storage_etag: 'etag-1',
    error_message: null,
    from_date: '2026-01-01',
    to_date: '2026-06-30',
    requested_at: '2026-06-26T00:00:00.000Z',
    started_at: '2026-06-26T00:00:01.000Z',
    completed_at: '2026-06-26T00:00:05.000Z',
    failed_at: null,
    expires_at: '2099-06-27T00:00:05.000Z',
    notify_when_ready: false,
    notify_email: null,
    ready_notification_status: 'not_requested',
    ready_notification_delivery: null,
    ready_notification_sent_at: null,
    ready_notification_error: null,
    last_heartbeat_at: '2026-06-26T00:00:05.000Z',
    updated_at: '2026-06-26T00:00:05.000Z',
    ...overrides,
  };
}

function createWhereChain<T>(run: () => Promise<T>) {
  const chain = {
    where: () => chain,
    orderBy: () => chain,
    selectAll: () => chain,
    select: () => chain,
    executeTakeFirst: run,
    execute: async () => [],
  };
  return chain;
}

function createMockDb(options: {
  latestRow?: ExportJobRow | undefined;
  jobRow?: ExportJobRow | undefined;
}) {
  return {
    selectFrom(table: string) {
      if (table !== 'company_export_jobs') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        selectAll: () =>
          createWhereChain(async () => options.latestRow ?? options.jobRow),
      };
    },
  };
}

function createRunnerDb(options: {
  insertedRow?: Partial<ExportJobRow>;
  userEmail?: string | null;
  userName?: string | null;
  companyName?: string | null;
}) {
  let row = buildRow({
    status: 'queued',
    file_name: null,
    content_type: null,
    file_size_bytes: null,
    storage_bucket: null,
    storage_key: null,
    storage_etag: null,
    completed_at: null,
    failed_at: null,
    expires_at: null,
    error_message: null,
    ready_notification_status: 'not_requested',
    ready_notification_delivery: null,
    ready_notification_sent_at: null,
    ready_notification_error: null,
    started_at: null,
    last_heartbeat_at: null,
    ...options.insertedRow,
  });
  const updateLogs: Record<string, unknown>[] = [];

  function createChain<T>(
    runTakeFirst: () => Promise<T>,
    runMany: () => Promise<T[]>
  ) {
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      select: () => chain,
      selectAll: () => chain,
      executeTakeFirst: runTakeFirst,
      execute: runMany,
    };
    return chain;
  }

  return {
    updateLogs,
    get row() {
      return row;
    },
    selectFrom(table: string) {
      if (table === 'company_export_jobs') {
        return {
          selectAll: () =>
            createChain(
              async () => row,
              async () => []
            ),
          select: () =>
            createChain(
              async () => ({
                storage_bucket: row.storage_bucket,
                storage_key: row.storage_key,
              }),
              async () => []
            ),
        };
      }

      if (table === 'users') {
        return {
          select: () =>
            createChain(
              async () => ({
                id: row.created_by_user_id,
                email: options.userEmail ?? 'owner@example.com',
                name: options.userName ?? 'Owner',
              }),
              async () => []
            ),
        };
      }

      if (table === 'companies') {
        return {
          select: () =>
            createChain(
              async () => ({ name: options.companyName ?? 'Acme Co' }),
              async () => []
            ),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    insertInto(table: string) {
      if (table !== 'company_export_jobs') {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      return {
        values(values: Record<string, unknown>) {
          row = {
            ...row,
            ...values,
          } as ExportJobRow;
          return {
            returningAll() {
              return {
                executeTakeFirstOrThrow: async () => row,
              };
            },
          };
        },
      };
    },
    updateTable(table: string) {
      if (table !== 'company_export_jobs') {
        throw new Error(`Unexpected update table: ${table}`);
      }

      return {
        set(values: Record<string, unknown>) {
          return {
            where: () => ({
              execute: async () => {
                updateLogs.push(values);
                row = {
                  ...row,
                  ...values,
                };
              },
            }),
          };
        },
      };
    },
  };
}

async function flushBackgroundWork(iterations = 8) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test('getLatestCompanyExportJobServer returns null when the user has no export jobs', async () => {
  currentDb = createMockDb({ latestRow: undefined });

  const { getLatestCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');
  const result = await getLatestCompanyExportJobServer({
    context: { session: { userId: asUserId('usr_1') } },
    companyId: asCompanyId('co_1'),
  });

  assert.equal(result, null);
  assert.equal(requireAuthorizedMock.mock.calls.length, 1);
});

test('getLatestCompanyExportJobServer maps expired completed jobs to expired responses', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-28T00:00:00.000Z'));
  currentDb = createMockDb({
    latestRow: buildRow({
      expires_at: '2026-06-27T00:00:05.000Z',
    }),
  });

  const { getLatestCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');
  const result = await getLatestCompanyExportJobServer({
    context: { session: { userId: asUserId('usr_1') } },
    companyId: asCompanyId('co_1'),
  });

  assert.equal(result?.status, 'expired');
  assert.equal(result?.fileName, undefined);
  assert.equal(result?.downloadPath, undefined);
  vi.useRealTimers();
});

test('getCompanyExportJobServer returns normalized job metadata for completed rows', async () => {
  currentDb = createMockDb({
    jobRow: buildRow({
      id: 'expjob_99',
      company_id: 'co_9',
      created_by_user_id: 'usr_9',
      detail: 'summary',
      scope: 'active',
    }),
  });

  const { getCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');
  const result = await getCompanyExportJobServer({
    context: { session: { userId: asUserId('usr_1') } },
    jobId: asCompanyExportJobId('expjob_99'),
  });

  assert.equal(result.id, 'expjob_99');
  assert.equal(result.companyId, 'co_9');
  assert.equal(result.createdByUserId, 'usr_9');
  assert.equal(result.scope, 'active');
  assert.equal(result.detail, 'summary');
  assert.equal(result.downloadPath, '/api/export-jobs/expjob_99/download');
  assert.equal(requireAuthorizedMock.mock.calls.length, 1);
  const authCall = requireAuthorizedMock.mock.calls[0] as
    | [Record<string, unknown>]
    | undefined;
  assert.equal(authCall?.[0].companyId, 'co_9');
});

test('downloadCompanyExportJobServer rejects expired exports', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-28T00:00:00.000Z'));
  currentDb = createMockDb({
    jobRow: buildRow({
      expires_at: '2026-06-27T00:00:05.000Z',
    }),
  });

  const { downloadCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');

  await assert.rejects(
    () =>
      downloadCompanyExportJobServer({
        context: { session: { userId: asUserId('usr_1') } },
        jobId: asCompanyExportJobId('expjob_1'),
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.message, 'Export file has expired');
      return true;
    }
  );

  assert.equal(getCompanyExportObjectMock.mock.calls.length, 0);
  vi.useRealTimers();
});

test('downloadCompanyExportJobServer rejects jobs that are not ready for download', async () => {
  currentDb = createMockDb({
    jobRow: buildRow({
      status: 'failed',
      file_name: null,
      storage_bucket: null,
      storage_key: null,
      content_type: null,
      completed_at: null,
      file_size_bytes: null,
      expires_at: null,
      error_message: 'Generation failed',
      failed_at: '2026-06-26T00:00:10.000Z',
    }),
  });

  const { downloadCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');

  await assert.rejects(
    () =>
      downloadCompanyExportJobServer({
        context: { session: { userId: asUserId('usr_1') } },
        jobId: asCompanyExportJobId('expjob_1'),
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'CONFLICT');
      assert.equal(error.message, 'Export is not ready for download');
      return true;
    }
  );
});

test('downloadCompanyExportJobServer returns stored bytes and falls back to storage content type', async () => {
  currentDb = createMockDb({
    jobRow: buildRow({
      content_type: null,
    }),
  });
  getCompanyExportObjectMock.mockResolvedValue({
    bucket: 'exports',
    key: 'co_1/expjob_1.xlsx',
    contentType: 'application/octet-stream',
    sizeBytes: 3,
    bytes: Uint8Array.from([1, 2, 3]),
  });

  const { downloadCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');
  const result = await downloadCompanyExportJobServer({
    context: { session: { userId: asUserId('usr_1') } },
    jobId: asCompanyExportJobId('expjob_1'),
  });

  assert.deepEqual(Array.from(result.bytes), [1, 2, 3]);
  assert.equal(result.fileName, 'acme-export.xlsx');
  assert.equal(result.contentType, 'application/octet-stream');
  assert.deepEqual(getCompanyExportObjectMock.mock.calls[0]?.[0], {
    bucket: 'exports',
    key: 'co_1/expjob_1.xlsx',
  });
});

test('createCompanyExportJobServer queues and completes a notified export job', async () => {
  const runnerDb = createRunnerDb({
    userEmail: 'owner@example.com',
    userName: 'Owner',
    companyName: 'Acme Delivery',
  });
  currentDb = runnerDb;
  exportCompanyWorkbookForUserMock.mockResolvedValue({
    fileName: 'acme-export.xlsx',
    bytes: Uint8Array.from([1, 2, 3]),
  });
  putCompanyExportObjectMock.mockResolvedValue({
    bucket: 'exports',
    key: 'co_1/acme-export.xlsx',
    etag: 'etag-1',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 3,
  });
  sendCompanyExportReadyEmailMock.mockResolvedValue('email');

  const { createCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');
  const result = await createCompanyExportJobServer({
    context: { session: { userId: asUserId('usr_1') } },
    companyId: asCompanyId('co_1'),
    options: {
      scope: 'all',
      detail: 'full',
      notifyWhenReady: true,
    },
  });

  await flushBackgroundWork();

  assert.equal(result.status, 'queued');
  assert.equal(result.notifyWhenReady, true);
  assert.equal(result.readyNotificationStatus, 'pending');
  assert.equal(exportCompanyWorkbookForUserMock.mock.calls.length, 1);
  assert.equal(putCompanyExportObjectMock.mock.calls.length, 1);
  assert.equal(sendCompanyExportReadyEmailMock.mock.calls.length, 1);
  assert.equal(runnerDb.row.status, 'completed');
  assert.equal(runnerDb.row.storage_key, 'co_1/acme-export.xlsx');
  assert.equal(runnerDb.row.ready_notification_status, 'sent');
  assert.equal(runnerDb.row.ready_notification_delivery, 'email');
  assert.equal(runnerDb.updateLogs.length, 3);
  const notificationCall = sendCompanyExportReadyEmailMock.mock.calls[0] as
    | [Record<string, unknown>]
    | undefined;
  assert.equal(notificationCall?.[0].toEmail, 'owner@example.com');
});

test('createCompanyExportJobServer marks ready notification failed when delivery throws', async () => {
  const warningLogs: string[] = [];
  const warningSpy = vi
    .spyOn(console, 'warn')
    .mockImplementation((message?: unknown) => {
      warningLogs.push(String(message));
    });
  const runnerDb = createRunnerDb({
    userEmail: 'owner@example.com',
    userName: 'Owner',
    companyName: 'Acme Delivery',
  });
  currentDb = runnerDb;
  exportCompanyWorkbookForUserMock.mockResolvedValue({
    fileName: 'acme-export.xlsx',
    bytes: Uint8Array.from([1, 2, 3]),
  });
  putCompanyExportObjectMock.mockResolvedValue({
    bucket: 'exports',
    key: 'co_1/acme-export.xlsx',
    etag: 'etag-1',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 3,
  });
  sendCompanyExportReadyEmailMock.mockRejectedValue(new Error('SMTP down'));

  const { createCompanyExportJobServer } =
    await import('../src/server/fns/exportJobs.ts');
  await createCompanyExportJobServer({
    context: { session: { userId: asUserId('usr_1') } },
    companyId: asCompanyId('co_1'),
    options: {
      scope: 'all',
      detail: 'full',
      notifyWhenReady: true,
    },
  });

  await flushBackgroundWork();

  assert.equal(runnerDb.row.status, 'completed');
  assert.equal(runnerDb.row.ready_notification_status, 'failed');
  assert.equal(
    runnerDb.row.ready_notification_error,
    'Could not send export ready notification.'
  );
  assert.equal(runnerDb.updateLogs.length, 3);
  assert.equal(warningLogs.length, 1);
  assert.match(
    warningLogs[0] ?? '',
    /company_export_ready_notification_failed/u
  );
  assert.doesNotMatch(warningLogs[0] ?? '', /SMTP down/u);
  warningSpy.mockRestore();
});
