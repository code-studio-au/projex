import { randomUUID } from 'node:crypto';
import type { Selectable } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  CompanyExportDetail,
  CompanyExportJob,
  CompanyExportJobId,
  CompanyExportJobStatus,
  CompanyExportOptions,
  CompanyExportScope,
  CompanyId,
  UserId,
} from '../../types';
import {
  asCompanyExportJobId,
  asCompanyId,
  asUserId,
} from '../../types';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { exportCompanyWorkbookForUser } from './exports';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const EXPORT_JOB_STALE_MS = 15 * 60 * 1000;

type ExportJobRow = Selectable<DB['company_export_jobs']>;

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
    fileName: status === 'completed' ? row.file_name ?? undefined : undefined,
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
  };
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

async function cleanupExpiredExportJobs(db = getDb()) {
  const now = nowIso();
  const retentionCutoff = new Date(
    Date.now() - EXPORT_JOB_RETENTION_MS
  ).toISOString();
  await db
    .deleteFrom('company_export_jobs')
    .where((eb) =>
      eb.or([
        eb.and([
          eb('expires_at', 'is not', null),
          eb('expires_at', '<=', now),
        ]),
        eb.and([
          eb('status', 'in', ['queued', 'running']),
          eb('requested_at', '<=', retentionCutoff),
        ]),
      ])
    )
    .execute();
}

function kickCompanyExportJob(jobId: CompanyExportJobId) {
  const active = activeExportJobs.get(jobId);
  if (active) return active;

  const promise = runCompanyExportJob(jobId)
    .catch((error) => {
      console.error(
        JSON.stringify({
          level: 'error',
          type: 'company_export_job',
          jobId,
          message:
            error instanceof Error ? error.message : 'Export job failed unexpectedly',
        })
      );
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

    await db
      .updateTable('company_export_jobs')
      .set({
        status: 'completed',
        file_name: result.fileName,
        content_type: XLSX_CONTENT_TYPE,
        file_bytes: fileBytes,
        file_size_bytes: fileBytes.byteLength,
        completed_at: completedAt,
        failed_at: null,
        error_message: null,
        expires_at: expiryIso(completedAt),
        last_heartbeat_at: completedAt,
        updated_at: completedAt,
      })
      .where('id', '=', jobId)
      .execute();
  } catch (error) {
    const failedAt = nowIso();
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Export generation failed';

    await db
      .updateTable('company_export_jobs')
      .set({
        status: 'failed',
        file_name: null,
        content_type: null,
        file_bytes: null,
        file_size_bytes: null,
        error_message: message,
        failed_at: failedAt,
        expires_at: expiryIso(failedAt),
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
    if (row.status !== 'completed' || !row.file_bytes || !row.file_name) {
      if (row.status === 'queued' || isStaleRunningJob(row)) {
        void kickCompanyExportJob(args.jobId);
      }
      throw new AppError('CONFLICT', 'Export is not ready for download');
    }

    return {
      bytes:
        row.file_bytes instanceof Uint8Array
          ? row.file_bytes
          : new Uint8Array(row.file_bytes),
      fileName: row.file_name,
      contentType: row.content_type ?? XLSX_CONTENT_TYPE,
    };
  });
}
