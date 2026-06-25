import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../src/api/errors.ts';
import { recoverStaleCompanyExportJobsOnStartup } from '../src/server/fns/exportJobs.ts';
import {
  getCompanyExportObject,
  putCompanyExportObject,
} from '../src/server/storage/exportObjectStore.ts';
import {
  asCompanyExportJobId,
  asCompanyId,
  asUserId,
} from '../src/types/index.ts';
import {
  assertAppErrorCode,
  createIntegrationDb,
  createRouteApi,
  insertExportJobFixture,
  integrationDatabaseUrl,
  integrationExportStorageConfigured,
} from './dbIntegration.helpers.ts';

const EXPORT_JOB_STALE_MESSAGE =
  'Export job was interrupted before completion. Please retry the export.';

test(
  'company export job creation is rate limited per user and company',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_export_rate_limit_co_1');
    const userId = asUserId('itest_export_rate_limit_usr_1');

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Export Rate Limit Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'export-rate-limit@example.com',
          name: 'Export Rate Limit User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({
          company_id: companyId,
          user_id: userId,
          role: 'admin',
        })
        .execute();
      await db
        .insertInto('request_rate_limits')
        .values({
          bucket: `company-export-job:${companyId}:${userId}`,
          window_started_at: new Date().toISOString(),
          count: 5,
          updated_at: new Date().toISOString(),
        })
        .execute();

      const api = createRouteApi(userId);
      await assertAppErrorCode(
        () =>
          api.createCompanyExportJob(companyId, {
            scope: 'all',
            detail: 'full',
          }),
        'RATE_LIMITED',
        'company export job rate limit'
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'startup recovery fails stale queued and running export jobs and clears stored objects',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_export_recovery_co_1');
    const userId = asUserId('itest_export_recovery_usr_1');
    const queuedJobId = asCompanyExportJobId('expjob_itest_export_recovery_q');
    const runningJobId = asCompanyExportJobId('expjob_itest_export_recovery_r');
    const staleRequestedAt = new Date(
      Date.now() - 20 * 60 * 1000
    ).toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Export Recovery Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'export-recovery@example.com',
          name: 'Export Recovery User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({
          company_id: companyId,
          user_id: userId,
          role: 'admin',
        })
        .execute();

      let storedObject: { bucket: string; key: string } | null = null;
      if (integrationExportStorageConfigured) {
        const object = await putCompanyExportObject({
          jobId: runningJobId,
          fileName: 'stale-export.xlsx',
          bytes: Buffer.from('stale-export-fixture'),
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        storedObject = {
          bucket: object.bucket,
          key: object.key,
        };
      }

      await insertExportJobFixture({
        db,
        jobId: queuedJobId,
        companyId,
        userId,
        status: 'queued',
        requestedAt: staleRequestedAt,
      });
      await insertExportJobFixture({
        db,
        jobId: runningJobId,
        companyId,
        userId,
        status: 'running',
        requestedAt: staleRequestedAt,
        fileName: storedObject ? 'stale-export.xlsx' : null,
        storageBucket: storedObject?.bucket ?? null,
        storageKey: storedObject?.key ?? null,
      });

      await recoverStaleCompanyExportJobsOnStartup(db);

      const recoveredRows = await db
        .selectFrom('company_export_jobs')
        .select([
          'id',
          'status',
          'error_message',
          'storage_bucket',
          'storage_key',
          'file_name',
        ])
        .where('id', 'in', [queuedJobId, runningJobId])
        .orderBy('id', 'asc')
        .execute();

      assert.deepEqual(
        recoveredRows.map((row) => ({
          id: row.id,
          status: row.status,
          errorMessage: row.error_message,
          storageBucket: row.storage_bucket,
          storageKey: row.storage_key,
          fileName: row.file_name,
        })),
        [
          {
            id: queuedJobId,
            status: 'failed',
            errorMessage: EXPORT_JOB_STALE_MESSAGE,
            storageBucket: null,
            storageKey: null,
            fileName: null,
          },
          {
            id: runningJobId,
            status: 'failed',
            errorMessage: EXPORT_JOB_STALE_MESSAGE,
            storageBucket: null,
            storageKey: null,
            fileName: null,
          },
        ]
      );

      if (storedObject) {
        await assert.rejects(
          () =>
            getCompanyExportObject({
              bucket: storedObject.bucket,
              key: storedObject.key,
            }),
          (error) =>
            error instanceof AppError &&
            error.code === 'NOT_FOUND' &&
            error.message === 'Export file is unavailable'
        );
      }
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
