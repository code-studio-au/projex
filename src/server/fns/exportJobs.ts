import { randomUUID } from 'node:crypto';
import type { Selectable } from 'kysely';

import { AppError } from '../../api/errors';
import { logServerEvent } from '../../api/serverLogging.ts';
import type {
  CompanyExportDetail,
  CompanyExportJob,
  CompanyExportJobId,
  CompanyExportJobStatus,
  CompanyExportReadyNotificationDelivery,
  CompanyExportReadyNotificationStatus,
  CompanyExportOptions,
  CompanyExportScope,
  CompanyId,
  UserId,
} from '../../types';
import { asCompanyExportJobId, asCompanyId, asUserId } from '../../types';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import { enforceRateLimit } from '../rateLimit';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { exportCompanyWorkbookForUser } from './exports';
import {
  buildCompanyExportReadyUrl,
  sendCompanyExportReadyEmail,
} from '../notifications/exportNotifications';
import {
  deleteCompanyExportObject,
  getCompanyExportObject,
  putCompanyExportObject,
} from '../storage/exportObjectStore';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const EXPORT_JOB_STALE_MS = 15 * 60 * 1000;
const EXPORT_JOB_RATE_LIMIT = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
} as const;
const EXPORT_JOB_STALE_MESSAGE =
  'Export job was interrupted before completion. Please retry the export.';
const EXPORT_NOTIFICATION_FAILURE_MESSAGE =
  'Could not send export ready notification.';

type ExportJobRow = Selectable<DB['company_export_jobs']>;

// This in-memory guard is intentionally single-process. It prevents duplicate
// concurrent execution inside the EC2/systemd runtime; persisted job rows still
// remain the source of truth across restarts.
const activeExportJobs = new Map<string, Promise<void>>();

function nowIso() {
  return new Date().toISOString();
}

function expiryIso(fromIso = nowIso()) {
  return new Date(
    new Date(fromIso).getTime() + EXPORT_JOB_RETENTION_MS
  ).toISOString();
}

function isExpired(row: Pick<ExportJobRow, 'status' | 'expires_at'>) {
  return (
    row.status === 'completed' &&
    !!row.expires_at &&
    new Date(row.expires_at).getTime() <= Date.now()
  );
}

function isStaleRunningJob(
  row: Pick<ExportJobRow, 'status' | 'last_heartbeat_at' | 'started_at'>
) {
  if (row.status !== 'running') return false;
  const referenceIso = row.last_heartbeat_at ?? row.started_at;
  if (!referenceIso) return true;
  return Date.now() - new Date(referenceIso).getTime() > EXPORT_JOB_STALE_MS;
}

function isStaleQueuedJob(row: Pick<ExportJobRow, 'status' | 'requested_at'>) {
  if (row.status !== 'queued') return false;
  return (
    Date.now() - new Date(row.requested_at).getTime() > EXPORT_JOB_STALE_MS
  );
}

function toCompanyExportOptions(row: ExportJobRow): CompanyExportOptions {
  return {
    scope: row.scope as CompanyExportScope,
    detail: row.detail as CompanyExportDetail,
    fromDate: row.from_date ?? undefined,
    toDate: row.to_date ?? undefined,
  };
}

function toCompanyExportJob(row: ExportJobRow): CompanyExportJob {
  const status: CompanyExportJobStatus = isExpired(row)
    ? 'expired'
    : (row.status as Exclude<CompanyExportJobStatus, 'expired'>);

  return {
    id: asCompanyExportJobId(row.id),
    companyId: asCompanyId(row.company_id),
    createdByUserId: asUserId(row.created_by_user_id),
    scope: row.scope as CompanyExportScope,
    detail: row.detail as CompanyExportDetail,
    status,
    fileName: status === 'completed' ? (row.file_name ?? undefined) : undefined,
    fileSizeBytes:
      status === 'completed' ? (row.file_size_bytes ?? undefined) : undefined,
    downloadPath:
      status === 'completed'
        ? `/api/export-jobs/${encodeURIComponent(row.id)}/download`
        : undefined,
    errorMessage: row.error_message ?? undefined,
    fromDate: row.from_date ?? undefined,
    toDate: row.to_date ?? undefined,
    requestedAt: row.requested_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    notifyWhenReady: row.notify_when_ready,
    readyNotificationStatus:
      row.ready_notification_status as CompanyExportReadyNotificationStatus,
    readyNotificationDelivery:
      (row.ready_notification_delivery as CompanyExportReadyNotificationDelivery | null) ??
      undefined,
    readyNotificationSentAt: row.ready_notification_sent_at ?? undefined,
    readyNotificationError: row.ready_notification_error ?? undefined,
  };
}

async function sendReadyNotificationIfRequested(args: {
  db: ReturnType<typeof getDb>;
  row: ExportJobRow;
  fileName: string;
  completedAt: string;
  expiresAt: string;
}) {
  if (!args.row.notify_when_ready || !args.row.notify_email) return;

  const user = await args.db
    .selectFrom('users')
    .select(['id', 'name', 'email'])
    .where('id', '=', args.row.created_by_user_id)
    .executeTakeFirst();

  try {
    const delivery = await sendCompanyExportReadyEmail({
      toEmail: args.row.notify_email,
      toName: user?.name ?? args.row.notify_email,
      companyName:
        (
          await args.db
            .selectFrom('companies')
            .select('name')
            .where('id', '=', args.row.company_id)
            .executeTakeFirst()
        )?.name ?? 'your company',
      fileName: args.fileName,
      generatedAt: args.completedAt,
      expiresAt: args.expiresAt,
      readyUrl: buildCompanyExportReadyUrl({
        companyId: asCompanyId(args.row.company_id),
        jobId: asCompanyExportJobId(args.row.id),
      }),
    });

    await args.db
      .updateTable('company_export_jobs')
      .set({
        ready_notification_status: 'sent',
        ready_notification_delivery: delivery,
        ready_notification_sent_at: nowIso(),
        ready_notification_error: null,
        updated_at: nowIso(),
      })
      .where('id', '=', args.row.id)
      .execute();
  } catch (error) {
    logServerEvent({
      level: 'warn',
      event: 'company_export_ready_notification_failed',
      error,
      fields: { jobId: args.row.id },
    });
    await args.db
      .updateTable('company_export_jobs')
      .set({
        ready_notification_status: 'failed',
        ready_notification_error: EXPORT_NOTIFICATION_FAILURE_MESSAGE,
        updated_at: nowIso(),
      })
      .where('id', '=', args.row.id)
      .execute();
  }
}

async function loadExportJobOrThrow(args: {
  jobId: CompanyExportJobId;
  userId: UserId;
}) {
  const db = getDb();
  const row = await db
    .selectFrom('company_export_jobs')
    .selectAll()
    .where('id', '=', args.jobId)
    .executeTakeFirst();
  if (!row) throw new AppError('NOT_FOUND', 'Unknown export job');

  await requireAuthorized({
    db,
    userId: args.userId,
    action: 'company:export',
    companyId: asCompanyId(row.company_id),
  });

  return { db, row };
}

async function deleteStoredExportObjectIfPresent(args: {
  row: Pick<ExportJobRow, 'id' | 'storage_bucket' | 'storage_key'>;
  logType: 'company_export_cleanup' | 'company_export_job_cleanup';
}) {
  if (!args.row.storage_bucket || !args.row.storage_key) return;

  try {
    await deleteCompanyExportObject({
      bucket: args.row.storage_bucket,
      key: args.row.storage_key,
    });
  } catch (error) {
    logServerEvent({
      level: 'error',
      event: args.logType,
      error,
      fields: {
        jobId: args.row.id,
      },
    });
  }
}

async function cleanupExpiredExportJobs(db = getDb()) {
  const now = nowIso();
  const retentionCutoff = new Date(
    Date.now() - EXPORT_JOB_RETENTION_MS
  ).toISOString();
  const rows = await db
    .selectFrom('company_export_jobs')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb.and([eb('expires_at', 'is not', null), eb('expires_at', '<=', now)]),
        eb.and([
          eb('status', 'in', ['queued', 'running']),
          eb('requested_at', '<=', retentionCutoff),
        ]),
      ])
    )
    .execute();

  await Promise.all(
    rows.map((row) =>
      deleteStoredExportObjectIfPresent({
        row,
        logType: 'company_export_cleanup',
      })
    )
  );

  if (!rows.length) return;

  await db
    .deleteFrom('company_export_jobs')
    .where(
      'id',
      'in',
      rows.map((row) => row.id)
    )
    .execute();
}

export async function recoverStaleCompanyExportJobsOnStartup(db = getDb()) {
  const rows = await db
    .selectFrom('company_export_jobs')
    .selectAll()
    .where('status', 'in', ['queued', 'running'])
    .execute();

  const staleRows = rows.filter(
    (row) => isStaleQueuedJob(row) || isStaleRunningJob(row)
  );
  if (!staleRows.length) return;

  for (const row of staleRows) {
    await deleteStoredExportObjectIfPresent({
      row,
      logType: 'company_export_cleanup',
    });

    const failedAt = nowIso();
    await db
      .updateTable('company_export_jobs')
      .set({
        status: 'failed',
        file_name: null,
        content_type: null,
        file_size_bytes: null,
        storage_bucket: null,
        storage_key: null,
        storage_etag: null,
        error_message: EXPORT_JOB_STALE_MESSAGE,
        failed_at: failedAt,
        expires_at: expiryIso(failedAt),
        ready_notification_status: row.notify_when_ready
          ? 'failed'
          : 'not_requested',
        ready_notification_error: row.notify_when_ready
          ? EXPORT_JOB_STALE_MESSAGE
          : null,
        last_heartbeat_at: failedAt,
        updated_at: failedAt,
      })
      .where('id', '=', row.id)
      .execute();
  }

  logServerEvent({
    level: 'warn',
    event: 'company_export_job_recovery',
    fields: {
      recoveredCount: staleRows.length,
    },
  });
}

function kickCompanyExportJob(jobId: CompanyExportJobId) {
  const active = activeExportJobs.get(jobId);
  if (active) return active;

  const promise = runCompanyExportJob(jobId)
    .catch((error) => {
      logServerEvent({
        level: 'error',
        event: 'company_export_job',
        error,
        fields: {
          jobId,
        },
      });
    })
    .finally(() => {
      activeExportJobs.delete(jobId);
    });

  activeExportJobs.set(jobId, promise);
  return promise;
}

async function runCompanyExportJob(jobId: CompanyExportJobId) {
  const db = getDb();
  const row = await db
    .selectFrom('company_export_jobs')
    .selectAll()
    .where('id', '=', jobId)
    .executeTakeFirst();
  if (!row || row.status === 'completed') return;
  if (row.status === 'running' && !isStaleRunningJob(row)) return;

  const startedAt = nowIso();
  await db
    .updateTable('company_export_jobs')
    .set({
      status: 'running',
      started_at: row.started_at ?? startedAt,
      failed_at: null,
      error_message: null,
      last_heartbeat_at: startedAt,
      updated_at: startedAt,
    })
    .where('id', '=', jobId)
    .execute();

  try {
    const result = await exportCompanyWorkbookForUser({
      db,
      userId: asUserId(row.created_by_user_id),
      companyId: asCompanyId(row.company_id),
      options: toCompanyExportOptions(row),
    });
    const completedAt = nowIso();
    const fileBytes = Buffer.from(result.bytes);
    const expiresAt = expiryIso(completedAt);
    const storedObject = await putCompanyExportObject({
      jobId,
      fileName: result.fileName,
      bytes: fileBytes,
      contentType: XLSX_CONTENT_TYPE,
    });

    await db
      .updateTable('company_export_jobs')
      .set({
        status: 'completed',
        file_name: result.fileName,
        content_type: storedObject.contentType,
        file_size_bytes: storedObject.sizeBytes,
        storage_bucket: storedObject.bucket,
        storage_key: storedObject.key,
        storage_etag: storedObject.etag ?? null,
        completed_at: completedAt,
        failed_at: null,
        error_message: null,
        expires_at: expiresAt,
        last_heartbeat_at: completedAt,
        updated_at: completedAt,
      })
      .where('id', '=', jobId)
      .execute();

    await sendReadyNotificationIfRequested({
      db,
      row,
      fileName: result.fileName,
      completedAt,
      expiresAt,
    });
  } catch (error) {
    const failedAt = nowIso();
    const message =
      error instanceof AppError ? error.message : 'Export generation failed';
    logServerEvent({
      level: 'error',
      event: 'company_export_job_failed',
      error,
      fields: { jobId },
    });

    const failedRow = await db
      .selectFrom('company_export_jobs')
      .select(['storage_bucket', 'storage_key'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    await deleteStoredExportObjectIfPresent({
      row: {
        id: jobId,
        storage_bucket: failedRow?.storage_bucket ?? null,
        storage_key: failedRow?.storage_key ?? null,
      },
      logType: 'company_export_job_cleanup',
    });

    await db
      .updateTable('company_export_jobs')
      .set({
        status: 'failed',
        file_name: null,
        content_type: null,
        file_size_bytes: null,
        storage_bucket: null,
        storage_key: null,
        storage_etag: null,
        error_message: message,
        failed_at: failedAt,
        expires_at: expiryIso(failedAt),
        ready_notification_status: row.notify_when_ready
          ? 'failed'
          : 'not_requested',
        ready_notification_error: row.notify_when_ready ? message : null,
        last_heartbeat_at: failedAt,
        updated_at: failedAt,
      })
      .where('id', '=', jobId)
      .execute();
  }
}

export async function createCompanyExportJobServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<CompanyExportJob> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);

    await requireAuthorized({
      db,
      userId,
      action: 'company:export',
      companyId: args.companyId,
    });
    await enforceRateLimit({
      db,
      bucket: `company-export-job:${args.companyId}:${userId}`,
      limit: EXPORT_JOB_RATE_LIMIT.limit,
      windowMs: EXPORT_JOB_RATE_LIMIT.windowMs,
      message:
        'Too many export requests. Please wait a few minutes before creating another export.',
    });
    await cleanupExpiredExportJobs(db);

    const id = asCompanyExportJobId(`expjob_${randomUUID()}`);
    const requestedAt = nowIso();
    const row = await db
      .insertInto('company_export_jobs')
      .values({
        id,
        company_id: args.companyId,
        created_by_user_id: userId,
        scope: args.options.scope,
        detail: args.options.detail,
        status: 'queued',
        from_date: args.options.fromDate ?? null,
        to_date: args.options.toDate ?? null,
        notify_when_ready: args.options.notifyWhenReady ?? false,
        notify_email:
          args.options.notifyWhenReady === true
            ? ((
                await db
                  .selectFrom('users')
                  .select('email')
                  .where('id', '=', userId)
                  .executeTakeFirst()
              )?.email ?? null)
            : null,
        ready_notification_status:
          args.options.notifyWhenReady === true ? 'pending' : 'not_requested',
        ready_notification_delivery: null,
        ready_notification_sent_at: null,
        ready_notification_error: null,
        requested_at: requestedAt,
        updated_at: requestedAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    void kickCompanyExportJob(id);

    return toCompanyExportJob(row);
  });
}

export async function getLatestCompanyExportJobServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyExportJob | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);

    await requireAuthorized({
      db,
      userId,
      action: 'company:export',
      companyId: args.companyId,
    });
    await cleanupExpiredExportJobs(db);

    const row = await db
      .selectFrom('company_export_jobs')
      .selectAll()
      .where('company_id', '=', args.companyId)
      .where('created_by_user_id', '=', userId)
      .orderBy('requested_at', 'desc')
      .executeTakeFirst();

    if (!row) return null;
    if (row.status === 'queued' || isStaleRunningJob(row)) {
      void kickCompanyExportJob(asCompanyExportJobId(row.id));
    }

    return toCompanyExportJob(row);
  });
}

export async function getCompanyExportJobServer(args: {
  context: ServerFnContextInput;
  jobId: CompanyExportJobId;
}): Promise<CompanyExportJob> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const { row } = await loadExportJobOrThrow({ jobId: args.jobId, userId });

    if (row.status === 'queued' || isStaleRunningJob(row)) {
      void kickCompanyExportJob(args.jobId);
    }

    return toCompanyExportJob(row);
  });
}

export async function downloadCompanyExportJobServer(args: {
  context: ServerFnContextInput;
  jobId: CompanyExportJobId;
}): Promise<{
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const { row } = await loadExportJobOrThrow({ jobId: args.jobId, userId });

    if (isExpired(row)) {
      throw new AppError('NOT_FOUND', 'Export file has expired');
    }
    if (
      row.status !== 'completed' ||
      !row.file_name ||
      !row.storage_bucket ||
      !row.storage_key
    ) {
      if (row.status === 'queued' || isStaleRunningJob(row)) {
        void kickCompanyExportJob(args.jobId);
      }
      throw new AppError('CONFLICT', 'Export is not ready for download');
    }

    const storedObject = await getCompanyExportObject({
      bucket: row.storage_bucket,
      key: row.storage_key,
    });

    return {
      bytes: storedObject.bytes,
      fileName: row.file_name,
      contentType:
        row.content_type ?? storedObject.contentType ?? XLSX_CONTENT_TYPE,
    };
  });
}
