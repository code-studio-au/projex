import assert from 'node:assert/strict';
import test from 'node:test';

import ExcelJS from 'exceljs';

import {
  createRouteApi,
  createIntegrationDb,
  assertAppError,
  assertAppErrorCode,
  insertExportJobFixture,
  integrationDatabaseUrl,
  integrationExportStorageConfigured,
  waitForExportJobCompletion,
} from './dbIntegration.helpers.ts';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireCompanyMember,
} from '../src/server/fns/resourceGuards.ts';
import {
  getCompanyExportObject,
  putCompanyExportObject,
} from '../src/server/storage/exportObjectStore.ts';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyExportJobId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';

test(
  'company export jobs preserve ready-email state and emit workbook metadata',
  { skip: !integrationDatabaseUrl || !integrationExportStorageConfigured },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_export_co_1');
    const userId = asUserId('itest_export_usr_1');
    const projectId = asProjectId('itest_export_prj_1');
    const previousResendApiKey = process.env.RESEND_API_KEY;
    const previousResendFrom = process.env.RESEND_FROM;
    const previousWebhookUrl = process.env.PROJEX_AUTH_EMAIL_WEBHOOK_URL;
    const previousWebhookBearer =
      process.env.PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN;

    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.PROJEX_AUTH_EMAIL_WEBHOOK_URL;
    delete process.env.PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Export Integration Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'export-integration@example.com',
          name: 'Export Integration User',
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
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Export Integration Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 125000,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'company',
          allow_superadmin_access: true,
        })
        .execute();
      await db
        .insertInto('budget_lines')
        .values({
          id: asBudgetLineId('itest_export_budget_1'),
          company_id: companyId,
          project_id: projectId,
          category_id: null,
          sub_category_id: null,
          allocated_cents: 125000,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: asTxnId('itest_export_txn_1'),
          external_id: 'row-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-06-01',
          item: 'Consulting',
          description: 'Delivery work',
          amount_cents: 45000,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
        })
        .execute();

      const api = createRouteApi(userId);
      const createdJob = await api.createCompanyExportJob(companyId, {
        scope: 'all',
        detail: 'full',
        notifyWhenReady: true,
      });

      const completedJob = await waitForExportJobCompletion({
        api,
        jobId: createdJob.id,
      });
      assert.equal(completedJob.status, 'completed');
      assert.equal(completedJob.notifyWhenReady, true);
      assert.equal(completedJob.readyNotificationStatus, 'sent');
      assert.equal(completedJob.readyNotificationDelivery, 'log');

      const download = await api.downloadCompanyExportJob(createdJob.id);
      const workbook = new ExcelJS.Workbook();
      const workbookBytes = Buffer.from(download.bytes);
      await workbook.xlsx.load(
        workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]
      );

      const metadataSheet = workbook.getWorksheet('Export Metadata');
      assert.ok(metadataSheet, 'expected Export Metadata worksheet');
      assert.equal(metadataSheet?.state, 'hidden');
      const metadata = new Map<string, string>();
      metadataSheet?.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const key = String(row.getCell(1).value ?? '');
        const value = String(row.getCell(2).value ?? '');
        metadata.set(key, value);
      });

      assert.equal(metadata.get('export_kind'), 'company_workbook');
      assert.equal(metadata.get('company_id'), companyId);
      assert.equal(metadata.get('project_scope'), 'all');
      assert.equal(metadata.get('workbook_detail'), 'full');
      assert.ok(metadata.get('contract_version'));
      assert.equal(metadata.get('file_name'), download.fileName);
    } finally {
      if (previousResendApiKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = previousResendApiKey;
      }
      if (previousResendFrom === undefined) {
        delete process.env.RESEND_FROM;
      } else {
        process.env.RESEND_FROM = previousResendFrom;
      }
      if (previousWebhookUrl === undefined) {
        delete process.env.PROJEX_AUTH_EMAIL_WEBHOOK_URL;
      } else {
        process.env.PROJEX_AUTH_EMAIL_WEBHOOK_URL = previousWebhookUrl;
      }
      if (previousWebhookBearer === undefined) {
        delete process.env.PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN;
      } else {
        process.env.PROJEX_AUTH_EMAIL_WEBHOOK_BEARER_TOKEN =
          previousWebhookBearer;
      }

      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'company export downloads stay scoped to the exporting user company access',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_export_scope_co_1');
    const ownerUserId = asUserId('itest_export_scope_owner_1');
    const otherUserId = asUserId('itest_export_scope_other_1');
    const jobId = asCompanyExportJobId('expjob_itest_export_scope_1');

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [ownerUserId, otherUserId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Scoped Export Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values([
          {
            id: ownerUserId,
            email: 'export-scope-owner@example.com',
            name: 'Export Scope Owner',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: otherUserId,
            email: 'export-scope-other@example.com',
            name: 'Export Scope Other',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values({
          company_id: companyId,
          user_id: ownerUserId,
          role: 'admin',
        })
        .execute();

      await insertExportJobFixture({
        db,
        jobId,
        companyId,
        userId: ownerUserId,
        status: 'completed',
        fileName: 'scoped-export.xlsx',
        storageBucket: 'fixture-bucket',
        storageKey: 'fixture/export.xlsx',
      });

      const otherApi = createRouteApi(otherUserId);
      await assertAppErrorCode(
        () => otherApi.getCompanyExportJob(jobId),
        'FORBIDDEN',
        'unauthorized export status lookup'
      );
      await assertAppErrorCode(
        () => otherApi.downloadCompanyExportJob(jobId),
        'FORBIDDEN',
        'unauthorized export download'
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [ownerUserId, otherUserId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'company export downloads report queued and expired states cleanly',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_export_state_co_1');
    const userId = asUserId('itest_export_state_usr_1');
    const queuedJobId = asCompanyExportJobId(
      'expjob_itest_export_state_queued'
    );
    const expiredJobId = asCompanyExportJobId(
      'expjob_itest_export_state_expired'
    );

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Export State Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'export-state@example.com',
          name: 'Export State User',
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

      await insertExportJobFixture({
        db,
        jobId: queuedJobId,
        companyId,
        userId,
        status: 'queued',
      });
      await insertExportJobFixture({
        db,
        jobId: expiredJobId,
        companyId,
        userId,
        status: 'completed',
        fileName: 'expired-export.xlsx',
        storageBucket: 'fixture-bucket',
        storageKey: 'fixture/expired-export.xlsx',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const api = createRouteApi(userId);
      await assertAppError(
        () => api.downloadCompanyExportJob(queuedJobId),
        'CONFLICT',
        'Export is not ready for download'
      );
      await assertAppError(
        () => api.downloadCompanyExportJob(expiredJobId),
        'NOT_FOUND',
        'Export file has expired'
      );

      const latestAfterCleanup = await api.getLatestCompanyExportJob(companyId);
      assert.equal(latestAfterCleanup?.id, queuedJobId);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'deleting a company only removes affected orphan users and preserves superadmins',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_delete_company_co_1');
    const superadminId = asUserId('itest_delete_company_super_1');
    const memberId = asUserId('itest_delete_company_member_1');
    const retainedMemberId = asUserId('itest_delete_company_member_2');

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [superadminId, memberId, retainedMemberId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Delete Company Test',
          status: 'deactivated',
          deactivated_at: new Date().toISOString(),
        })
        .execute();
      await db
        .insertInto('users')
        .values([
          {
            id: superadminId,
            email: 'delete-company-superadmin@example.com',
            name: 'Delete Company Superadmin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: true,
          },
          {
            id: memberId,
            email: 'delete-company-member@example.com',
            name: 'Delete Company Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: retainedMemberId,
            email: 'delete-company-retained@example.com',
            name: 'Delete Company Retained',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values([
          {
            company_id: companyId,
            user_id: memberId,
            role: 'admin',
          },
          {
            company_id: companyId,
            user_id: retainedMemberId,
            role: 'member',
          },
        ])
        .execute();

      const secondCompanyId = asCompanyId('itest_delete_company_co_2');
      await db
        .deleteFrom('companies')
        .where('id', '=', secondCompanyId)
        .execute();
      await db
        .insertInto('companies')
        .values({
          id: secondCompanyId,
          name: 'Delete Company Retained Scope',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({
          company_id: secondCompanyId,
          user_id: retainedMemberId,
          role: 'member',
        })
        .execute();

      const api = createRouteApi(superadminId);
      await api.deleteCompany({
        companyId,
        confirmation: 'DELETE Delete Company Test',
      });

      const deletedCompany = await db
        .selectFrom('companies')
        .select('id')
        .where('id', '=', companyId)
        .executeTakeFirst();
      assert.equal(deletedCompany, undefined);

      const remainingUsers = await db
        .selectFrom('users')
        .select(['id', 'is_global_superadmin'])
        .where('id', 'in', [superadminId, memberId, retainedMemberId])
        .orderBy('id', 'asc')
        .execute();
      assert.deepEqual(
        remainingUsers.map((row) => ({
          id: row.id,
          isGlobalSuperadmin: row.is_global_superadmin,
        })),
        [
          { id: retainedMemberId, isGlobalSuperadmin: false },
          { id: superadminId, isGlobalSuperadmin: true },
        ]
      );

      await db
        .deleteFrom('companies')
        .where('id', '=', secondCompanyId)
        .execute();
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [superadminId, memberId, retainedMemberId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'deleting a company removes persisted export objects from S3-compatible storage',
  { skip: !integrationDatabaseUrl || !integrationExportStorageConfigured },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_delete_company_exports_co_1');
    const superadminId = asUserId('itest_delete_company_exports_super_1');
    const memberId = asUserId('itest_delete_company_exports_member_1');
    const exportJobId = asCompanyExportJobId(
      'expjob_itest_delete_company_exports_1'
    );

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [superadminId, memberId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Delete Company Export Cleanup',
          status: 'deactivated',
          deactivated_at: new Date().toISOString(),
        })
        .execute();
      await db
        .insertInto('users')
        .values([
          {
            id: superadminId,
            email: 'delete-company-export-superadmin@example.com',
            name: 'Delete Company Export Superadmin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: true,
          },
          {
            id: memberId,
            email: 'delete-company-export-member@example.com',
            name: 'Delete Company Export Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values({
          company_id: companyId,
          user_id: memberId,
          role: 'admin',
        })
        .execute();

      const storedObject = await putCompanyExportObject({
        jobId: exportJobId,
        fileName: 'delete-company-export-cleanup.xlsx',
        bytes: Buffer.from('export-fixture'),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await insertExportJobFixture({
        db,
        jobId: exportJobId,
        companyId,
        userId: memberId,
        status: 'completed',
        fileName: 'delete-company-export-cleanup.xlsx',
        storageBucket: storedObject.bucket,
        storageKey: storedObject.key,
      });

      const api = createRouteApi(superadminId);
      await api.deleteCompany({
        companyId,
        confirmation: 'DELETE Delete Company Export Cleanup',
      });

      const deletedCompany = await db
        .selectFrom('companies')
        .select('id')
        .where('id', '=', companyId)
        .executeTakeFirst();
      assert.equal(deletedCompany, undefined);

      await assertAppError(
        () =>
          getCompanyExportObject({
            bucket: storedObject.bucket,
            key: storedObject.key,
          }),
        'NOT_FOUND',
        'Export file is unavailable'
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [superadminId, memberId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'resource ownership guards enforce persisted parent scope',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_co_1');
    const otherCompanyId = asCompanyId('itest_co_2');
    const userId = asUserId('itest_usr_1');
    const projectId = asProjectId('itest_prj_1');
    const otherProjectId = asProjectId('itest_prj_2');
    const categoryId = asCategoryId('itest_cat_1');
    const subCategoryId = asSubCategoryId('itest_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId('itest_ccat_1');
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId('itest_csub_1');
    const mappingRuleId = asCompanyDefaultMappingRuleId('itest_rule_1');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Integration Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: otherCompanyId,
            name: 'Other Integration Company',
            status: 'active',
            deactivated_at: null,
          },
        ])
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'integration@example.com',
          name: 'Integration User',
          disabled: false,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Integration Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
          },
          {
            id: otherProjectId,
            company_id: otherCompanyId,
            name: 'Other Integration Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'member' })
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: categoryId,
          company_id: companyId,
          project_id: projectId,
          name: 'Travel',
        })
        .execute();
      await db
        .insertInto('sub_categories')
        .values({
          id: subCategoryId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryId,
          name: 'Flights',
        })
        .execute();
      await db
        .insertInto('company_default_categories')
        .values({
          id: defaultCategoryId,
          company_id: companyId,
          name: 'Travel',
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Flights',
        })
        .execute();
      await db
        .insertInto('company_default_mapping_rules')
        .values({
          id: mappingRuleId,
          company_id: companyId,
          match_text: 'flight',
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: defaultSubCategoryId,
          sort_order: 0,
        })
        .execute();

      await requireCompanyMember({ db, companyId, userId });
      await assertCategoryInProject({ db, projectId, categoryId });
      await assertSubCategoryInProject({
        db,
        projectId,
        categoryId,
        subCategoryId,
      });
      await assertCompanyDefaultMappingRuleInCompany({
        db,
        companyId,
        ruleId: mappingRuleId,
      });

      await assertAppError(
        () => requireCompanyMember({ db, companyId: otherCompanyId, userId }),
        'VALIDATION_ERROR',
        'User must be a company member before being added to a project'
      );
      await assertAppError(
        () =>
          assertCategoryInProject({
            db,
            projectId: otherProjectId,
            categoryId,
          }),
        'NOT_FOUND',
        'Unknown category'
      );
      await assertAppError(
        () =>
          assertCompanyDefaultMappingRuleInCompany({
            db,
            companyId: otherCompanyId,
            ruleId: mappingRuleId,
          }),
        'NOT_FOUND',
        'Unknown company default mapping rule'
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
