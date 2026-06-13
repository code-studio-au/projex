import assert from 'node:assert/strict';
import test from 'node:test';

import ExcelJS from 'exceljs';
import { Kysely, PostgresDialect } from 'kysely';
import type { PostgresDialectConfig } from 'kysely';

import type {
  BudgetCreateInput,
  CategoryCreateInput,
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyUpdateInput,
  CreateCompanyUserInput,
  DeleteCompanyInput,
  DeleteProjectInput,
  ImportCandidateReviewInput,
  ImportRuleCreateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  SubCategoryCreateInput,
  TxnCommentCreateInput,
  TxnCommentUpdateInput,
  TxnCreateInput,
  TxnImportInput,
  TxnImportPreviewInput,
  TxnListPageInput,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnWorkflowStateInput,
} from '../src/api/contract.ts';
import { AppError } from '../src/api/errors.ts';
import { isAuthorized } from '../src/server/auth/authorize.ts';
import { createPgPool } from '../src/server/db/pgPool.ts';
import type { DB } from '../src/server/db/schema.ts';
import {
  createBudgetServer,
  listBudgetsServer,
  deleteBudgetServer,
  updateBudgetServer,
} from '../src/server/fns/budgets.ts';
import {
  deleteCompanyMembershipServer,
  listAllCompanyMembershipsServer,
  listCompanyMembershipsServer,
  listMyProjectMembershipsServer,
  listProjectMembershipsServer,
  upsertCompanyMembershipServer,
  upsertProjectMembershipServer,
  deleteProjectMembershipServer,
} from '../src/server/fns/memberships.ts';
import {
  createCompanyServer,
  createUserInCompanyServer,
  deactivateCompanyServer,
  deleteCompanyServer,
  getCompanyServer,
  getCompanySummaryServer,
  listUsersServer,
  listCompaniesServer,
  reactivateCompanyServer,
  sendCompanyUserInviteEmailServer,
  updateCompanyServer,
} from '../src/server/fns/companies.ts';
import {
  createProjectServer,
  deactivateProjectServer,
  getProjectServer,
  listProjectsServer,
  reactivateProjectServer,
  updateProjectServer,
  deleteProjectServer,
} from '../src/server/fns/projects.ts';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireOperationalProjectForAction,
  requireProjectForAction,
  requireCompanyMember,
} from '../src/server/fns/resourceGuards.ts';
import {
  deleteTransactionCommentServer,
  createTransactionCommentServer,
  listTransactionCommentsServer,
  listTransactionCommentSummariesServer,
  updateTransactionCommentServer,
} from '../src/server/fns/transactionComments.ts';
import {
  cancelImportPreviewServer,
  createTxnServer,
  deleteTxnServer,
  importTransactionsServer,
  listImportCandidatesServer,
  listTransactionsPageServer,
  listTransactionsServer,
  previewImportTransactionsServer,
  reviewImportCandidateServer,
  splitTxnServer,
  transferTxnServer,
  updateTxnServer,
  updateTxnWorkflowStateServer,
} from '../src/server/fns/transactions.ts';
import {
  createCompanyExportJobServer,
  downloadCompanyExportJobServer,
  getCompanyExportJobServer,
} from '../src/server/fns/exportJobs.ts';
import {
  applyCompanyDefaultTaxonomyServer,
  createCategoryServer,
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  createSubCategoryServer,
  deleteCategoryServer,
  deleteCompanyDefaultCategoryServer,
  deleteCompanyDefaultMappingRuleServer,
  deleteCompanyDefaultSubCategoryServer,
  deleteSubCategoryServer,
  getCompanyDefaultsServer,
  listCategoriesServer,
  listCompanyDefaultCategoriesServer,
  listCompanyDefaultMappingRulesServer,
  listCompanyDefaultSubCategoriesServer,
  listSubCategoriesServer,
  updateCompanyDefaultSubCategoryServer,
} from '../src/server/fns/taxonomy.ts';
import {
  createImportRuleServer,
  deleteImportRuleServer,
  listImportRulesServer,
} from '../src/server/fns/importRules.ts';
import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import {
  asCategoryId,
  asBudgetLineId,
  type CompanyRole,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyExportJobId,
  asCompanyId,
  asImportBatchId,
  asImportCandidateId,
  asImportRuleId,
  asProjectId,
  type ProjectRole,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';

const integrationDatabaseUrl =
  process.env.PROJEX_INTEGRATION_DATABASE_URL?.trim() ?? '';
const integrationExportStorageConfigured =
  Boolean(process.env.S3_BUCKET?.trim()) &&
  Boolean(process.env.S3_REGION?.trim());

function assertTestDatabaseUrl(connectionString: string) {
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run DB integration tests against non-test database "${databaseName}". Use a database name containing "test".`
    );
  }
}

function createIntegrationDb() {
  assertTestDatabaseUrl(integrationDatabaseUrl);
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: createPgPool(
        integrationDatabaseUrl
      ) as unknown as PostgresDialectConfig['pool'],
    }),
  });
}

async function assertAppError(
  run: () => Promise<unknown>,
  code: AppError['code'],
  message: string
) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  });
}

async function assertAppErrorCode(
  run: () => Promise<unknown>,
  code: AppError['code'],
  label: string
) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof AppError, `${label}: expected AppError`);
    assert.equal(error.code, code, `${label}: unexpected error code`);
    return true;
  });
}

function createRouteApi(userId?: ReturnType<typeof asUserId> | null) {
  const context = {
    session: userId ? { userId } : null,
  } satisfies ServerFnContextInput;

  return {
    listUsers: () => listUsersServer({ context }),
    listCompanies: () => listCompaniesServer({ context }),
    createCompany: (input: {
      name: string;
      id?: string;
      initialAdminName?: string;
      initialAdminEmail?: string;
    }) =>
      createCompanyServer({
        context,
        input: {
          name: input.name,
          id: input.id ? asCompanyId(input.id) : undefined,
          initialAdminName: input.initialAdminName,
          initialAdminEmail: input.initialAdminEmail,
        },
      }),
    getCompany: (companyId: ReturnType<typeof asCompanyId>) =>
      getCompanyServer({ context, companyId }),
    updateCompany: (input: CompanyUpdateInput) =>
      updateCompanyServer({ context, input }),
    deleteCompany: (input: DeleteCompanyInput) =>
      deleteCompanyServer({ context, ...input }),
    deactivateCompany: (companyId: ReturnType<typeof asCompanyId>) =>
      deactivateCompanyServer({ context, companyId }),
    reactivateCompany: (companyId: ReturnType<typeof asCompanyId>) =>
      reactivateCompanyServer({ context, companyId }),
    getCompanySummary: (companyId: ReturnType<typeof asCompanyId>) =>
      getCompanySummaryServer({ context, companyId }),
    getCompanyDefaults: (companyId: ReturnType<typeof asCompanyId>) =>
      getCompanyDefaultsServer({ context, companyId }),
    listProjects: (companyId: ReturnType<typeof asCompanyId>) =>
      listProjectsServer({ context, companyId }),
    createProject: (
      companyId: ReturnType<typeof asCompanyId>,
      input: ProjectCreateInput
    ) => createProjectServer({ context, companyId, input }),
    listCompanyMemberships: (companyId: ReturnType<typeof asCompanyId>) =>
      listCompanyMembershipsServer({ context, companyId }),
    listAllCompanyMemberships: () =>
      listAllCompanyMembershipsServer({ context }),
    upsertCompanyMembership: (
      companyId: ReturnType<typeof asCompanyId>,
      userId: ReturnType<typeof asUserId>,
      role: CompanyRole
    ) => upsertCompanyMembershipServer({ context, companyId, userId, role }),
    deleteCompanyMembership: (
      companyId: ReturnType<typeof asCompanyId>,
      userId: ReturnType<typeof asUserId>
    ) => deleteCompanyMembershipServer({ context, companyId, userId }),
    listMyProjectMemberships: (companyId: ReturnType<typeof asCompanyId>) =>
      listMyProjectMembershipsServer({ context, companyId }),
    createUserInCompany: (
      companyId: ReturnType<typeof asCompanyId>,
      input: CreateCompanyUserInput
    ) =>
      createUserInCompanyServer({
        context,
        companyId,
        name: input.name,
        email: input.email,
        role: input.role,
        sendOnboardingEmail: input.sendOnboardingEmail,
      }),
    sendCompanyUserInviteEmail: (
      companyId: ReturnType<typeof asCompanyId>,
      userId: ReturnType<typeof asUserId>
    ) => sendCompanyUserInviteEmailServer({ context, companyId, userId }),
    listCompanyDefaultCategories: (companyId: ReturnType<typeof asCompanyId>) =>
      listCompanyDefaultCategoriesServer({ context, companyId }),
    createCompanyDefaultCategory: (
      companyId: ReturnType<typeof asCompanyId>,
      input: CompanyDefaultCategoryCreateInput
    ) => createCompanyDefaultCategoryServer({ context, companyId, input }),
    deleteCompanyDefaultCategory: (
      companyId: ReturnType<typeof asCompanyId>,
      categoryId: ReturnType<typeof asCompanyDefaultCategoryId>
    ) => deleteCompanyDefaultCategoryServer({ context, companyId, categoryId }),
    listCompanyDefaultSubCategories: (
      companyId: ReturnType<typeof asCompanyId>
    ) => listCompanyDefaultSubCategoriesServer({ context, companyId }),
    createCompanyDefaultSubCategory: (
      companyId: ReturnType<typeof asCompanyId>,
      input: CompanyDefaultSubCategoryCreateInput
    ) => createCompanyDefaultSubCategoryServer({ context, companyId, input }),
    updateCompanyDefaultSubCategory: (
      companyId: ReturnType<typeof asCompanyId>,
      input: Parameters<
        typeof updateCompanyDefaultSubCategoryServer
      >[0]['input']
    ) =>
      updateCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input,
      }),
    deleteCompanyDefaultSubCategory: (
      companyId: ReturnType<typeof asCompanyId>,
      subCategoryId: ReturnType<typeof asCompanyDefaultSubCategoryId>
    ) =>
      deleteCompanyDefaultSubCategoryServer({
        context,
        companyId,
        subCategoryId,
      }),
    listCompanyDefaultMappingRules: (
      companyId: ReturnType<typeof asCompanyId>
    ) => listCompanyDefaultMappingRulesServer({ context, companyId }),
    createCompanyDefaultMappingRule: (
      companyId: ReturnType<typeof asCompanyId>,
      input: CompanyDefaultMappingRuleCreateInput
    ) => createCompanyDefaultMappingRuleServer({ context, companyId, input }),
    deleteCompanyDefaultMappingRule: (
      companyId: ReturnType<typeof asCompanyId>,
      ruleId: ReturnType<typeof asCompanyDefaultMappingRuleId>
    ) => deleteCompanyDefaultMappingRuleServer({ context, companyId, ruleId }),
    listImportRules: (companyId: ReturnType<typeof asCompanyId>) =>
      listImportRulesServer({ context, companyId }),
    createImportRule: (
      companyId: ReturnType<typeof asCompanyId>,
      input: ImportRuleCreateInput
    ) => createImportRuleServer({ context, companyId, input }),
    deleteImportRule: (
      companyId: ReturnType<typeof asCompanyId>,
      ruleId: ReturnType<typeof asImportRuleId>
    ) => deleteImportRuleServer({ context, companyId, ruleId }),
    getProject: (projectId: ReturnType<typeof asProjectId>) =>
      getProjectServer({ context, projectId }),
    updateProject: (input: ProjectUpdateInput) =>
      updateProjectServer({ context, input }),
    deleteProject: (input: DeleteProjectInput) =>
      deleteProjectServer({ context, ...input }),
    deactivateProject: (projectId: ReturnType<typeof asProjectId>) =>
      deactivateProjectServer({ context, projectId }),
    reactivateProject: (projectId: ReturnType<typeof asProjectId>) =>
      reactivateProjectServer({ context, projectId }),
    listProjectMemberships: (projectId: ReturnType<typeof asProjectId>) =>
      listProjectMembershipsServer({ context, projectId }),
    upsertProjectMembership: (
      projectId: ReturnType<typeof asProjectId>,
      userId: ReturnType<typeof asUserId>,
      role: ProjectRole
    ) => upsertProjectMembershipServer({ context, projectId, userId, role }),
    deleteProjectMembership: (
      projectId: ReturnType<typeof asProjectId>,
      userId: ReturnType<typeof asUserId>,
      role: ProjectRole
    ) => deleteProjectMembershipServer({ context, projectId, userId, role }),
    applyCompanyDefaultTaxonomy: (projectId: ReturnType<typeof asProjectId>) =>
      applyCompanyDefaultTaxonomyServer({ context, projectId }),
    listCategories: (projectId: ReturnType<typeof asProjectId>) =>
      listCategoriesServer({ context, projectId }),
    createCategory: (
      projectId: ReturnType<typeof asProjectId>,
      input: CategoryCreateInput
    ) => createCategoryServer({ context, projectId, input }),
    deleteCategory: (
      projectId: ReturnType<typeof asProjectId>,
      categoryId: ReturnType<typeof asCategoryId>
    ) => deleteCategoryServer({ context, projectId, categoryId }),
    listSubCategories: (projectId: ReturnType<typeof asProjectId>) =>
      listSubCategoriesServer({ context, projectId }),
    createSubCategory: (
      projectId: ReturnType<typeof asProjectId>,
      input: SubCategoryCreateInput
    ) => createSubCategoryServer({ context, projectId, input }),
    deleteSubCategory: (
      projectId: ReturnType<typeof asProjectId>,
      subCategoryId: ReturnType<typeof asSubCategoryId>
    ) => deleteSubCategoryServer({ context, projectId, subCategoryId }),
    listBudgets: (projectId: ReturnType<typeof asProjectId>) =>
      listBudgetsServer({ context, projectId }),
    createBudget: (
      projectId: ReturnType<typeof asProjectId>,
      input: BudgetCreateInput
    ) => createBudgetServer({ context, projectId, input }),
    updateBudget: (
      projectId: ReturnType<typeof asProjectId>,
      input: Parameters<typeof updateBudgetServer>[0]['input']
    ) => updateBudgetServer({ context, projectId, input }),
    deleteBudget: (
      projectId: ReturnType<typeof asProjectId>,
      budgetId: ReturnType<typeof asBudgetLineId>
    ) => deleteBudgetServer({ context, projectId, budgetId }),
    listTransactions: (projectId: ReturnType<typeof asProjectId>) =>
      listTransactionsServer({ context, projectId }),
    listTransactionsPage: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnListPageInput
    ) => listTransactionsPageServer({ context, projectId, input }),
    createTxn: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnCreateInput
    ) => createTxnServer({ context, projectId, input }),
    updateTxn: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnUpdateInput
    ) => updateTxnServer({ context, projectId, input }),
    deleteTxn: (
      projectId: ReturnType<typeof asProjectId>,
      txnId: ReturnType<typeof asTxnId>
    ) => deleteTxnServer({ context, projectId, txnId }),
    splitTxn: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnSplitInput
    ) => splitTxnServer({ context, projectId, input }),
    transferTxn: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnTransferInput
    ) => transferTxnServer({ context, projectId, input }),
    updateTxnWorkflowState: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnWorkflowStateInput
    ) => updateTxnWorkflowStateServer({ context, projectId, input }),
    listTransactionCommentSummaries: (
      projectId: ReturnType<typeof asProjectId>
    ) => listTransactionCommentSummariesServer({ context, projectId }),
    listTransactionComments: (
      projectId: ReturnType<typeof asProjectId>,
      txnId: ReturnType<typeof asTxnId>
    ) => listTransactionCommentsServer({ context, projectId, txnId }),
    createTransactionComment: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnCommentCreateInput
    ) => createTransactionCommentServer({ context, projectId, input }),
    updateTransactionComment: (
      projectId: ReturnType<typeof asProjectId>,
      txnId: ReturnType<typeof asTxnId>,
      input: TxnCommentUpdateInput
    ) => updateTransactionCommentServer({ context, projectId, txnId, input }),
    deleteTransactionComment: (
      projectId: ReturnType<typeof asProjectId>,
      txnId: ReturnType<typeof asTxnId>,
      commentId: ReturnType<typeof asTxnCommentId>
    ) =>
      deleteTransactionCommentServer({ context, projectId, txnId, commentId }),
    previewImportTransactions: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnImportPreviewInput
    ) =>
      previewImportTransactionsServer({
        context,
        projectId,
        csvText: input.csvText,
        sourceType: input.sourceType,
        fileName: input.fileName,
        autoCreateStructures: input.autoCreateStructures,
      }),
    importTransactions: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnImportInput
    ) =>
      importTransactionsServer({
        context,
        projectId,
        txns: input.txns,
        mode: input.mode,
        autoCreateBudgets: input.autoCreateBudgets,
      }),
    listImportCandidates: (projectId: ReturnType<typeof asProjectId>) =>
      listImportCandidatesServer({ context, projectId }),
    reviewImportCandidate: (
      projectId: ReturnType<typeof asProjectId>,
      input: ImportCandidateReviewInput
    ) =>
      reviewImportCandidateServer({
        context,
        projectId,
        candidateId: input.candidateId,
        decision: input.decision,
      }),
    cancelImportPreview: (
      projectId: ReturnType<typeof asProjectId>,
      importBatchId: ReturnType<typeof asImportBatchId>
    ) => cancelImportPreviewServer({ context, projectId, importBatchId }),
    createCompanyExportJob: (
      companyId: ReturnType<typeof asCompanyId>,
      options: Parameters<typeof createCompanyExportJobServer>[0]['options']
    ) => createCompanyExportJobServer({ context, companyId, options }),
    getCompanyExportJob: (jobId: ReturnType<typeof asCompanyExportJobId>) =>
      getCompanyExportJobServer({ context, jobId }),
    downloadCompanyExportJob: (
      jobId: ReturnType<typeof asCompanyExportJobId>
    ) => downloadCompanyExportJobServer({ context, jobId }),
  };
}

type RouteApi = ReturnType<typeof createRouteApi>;

async function waitForExportJobCompletion(args: {
  api: RouteApi;
  jobId: ReturnType<typeof asCompanyExportJobId>;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (args.timeoutMs ?? 10_000);
  for (;;) {
    const job = await args.api.getCompanyExportJob(args.jobId);
    if (job.status === 'completed' || job.status === 'failed') return job;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for export job ${args.jobId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

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

test(
  'superadmin authorization respects allow_superadmin_access for project-scoped actions',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_super_co_1');
    const superadminId = asUserId('itest_super_usr_1');
    const allowedProjectId = asProjectId('itest_super_prj_1');
    const blockedProjectId = asProjectId('itest_super_prj_2');

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', superadminId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Superadmin Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: superadminId,
          email: 'superadmin@example.com',
          name: 'Super Admin',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: true,
        })
        .execute();
      await db
        .insertInto('projects')
        .values([
          {
            id: allowedProjectId,
            company_id: companyId,
            name: 'Allowed Project',
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
            id: blockedProjectId,
            company_id: companyId,
            name: 'Blocked Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: false,
          },
        ])
        .execute();

      assert.equal(
        await isAuthorized({
          db,
          userId: superadminId,
          action: 'company:view',
          companyId,
        }),
        true
      );
      assert.equal(
        await isAuthorized({
          db,
          userId: superadminId,
          action: 'project:view',
          companyId,
          projectId: allowedProjectId,
        }),
        true
      );
      assert.equal(
        await isAuthorized({
          db,
          userId: superadminId,
          action: 'project:view',
          companyId,
          projectId: blockedProjectId,
        }),
        false
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', superadminId).execute();
      await db.destroy();
    }
  }
);

test(
  'project resource guards reject cross-project and viewer mutation access',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_guard_co_1');
    const otherCompanyId = asCompanyId('itest_guard_co_2');
    const memberUserId = asUserId('itest_guard_usr_member');
    const viewerUserId = asUserId('itest_guard_usr_viewer');
    const outsiderUserId = asUserId('itest_guard_usr_outsider');
    const projectId = asProjectId('itest_guard_prj_1');
    const programmeId = asProjectId('itest_guard_prog_1');
    const otherProjectId = asProjectId('itest_guard_prj_2');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId, outsiderUserId])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Guard Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: otherCompanyId,
            name: 'Other Guard Company',
            status: 'active',
            deactivated_at: null,
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: memberUserId,
            email: 'guard-member@example.com',
            name: 'Guard Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: viewerUserId,
            email: 'guard-viewer@example.com',
            name: 'Guard Viewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: outsiderUserId,
            email: 'guard-outsider@example.com',
            name: 'Guard Outsider',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Guard Project',
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
            id: programmeId,
            company_id: companyId,
            name: 'Guard Programme',
            project_type: 'programme',
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
            name: 'Other Guard Project',
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
        .values([
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
        ])
        .execute();
      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: memberUserId, role: 'member' },
          { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
          { project_id: programmeId, user_id: memberUserId, role: 'member' },
        ])
        .execute();

      const memberContext = await requireProjectForAction(
        { session: { userId: memberUserId } },
        projectId,
        'project:view',
        db
      );
      assert.equal(memberContext.companyId, companyId);
      assert.equal(memberContext.projectId, projectId);

      await assertAppError(
        () =>
          requireProjectForAction(
            { session: { userId: viewerUserId } },
            projectId,
            'txns:edit',
            db
          ),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          requireProjectForAction(
            { session: { userId: memberUserId } },
            otherProjectId,
            'project:view',
            db
          ),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          requireProjectForAction(
            { session: { userId: outsiderUserId } },
            projectId,
            'project:view',
            db
          ),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          requireOperationalProjectForAction(
            { session: { userId: memberUserId } },
            programmeId,
            'txns:edit',
            db
          ),
        'VALIDATION_ERROR',
        'Programmes are reporting-only and cannot be used for project operations'
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId, outsiderUserId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'project listing and detail access respect deactivated companies and archived projects',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_status_co_1');
    const userId = asUserId('itest_status_usr_1');
    const activeProjectId = asProjectId('itest_status_prj_active');
    const archivedProjectId = asProjectId('itest_status_prj_archived');
    const deactivatedCompanyId = asCompanyId('itest_status_co_2');
    const hiddenProjectId = asProjectId('itest_status_prj_hidden');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Status Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: deactivatedCompanyId,
            name: 'Deactivated Company',
            status: 'deactivated',
            deactivated_at: new Date().toISOString(),
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'status-user@example.com',
          name: 'Status User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: userId, role: 'member' },
          { company_id: deactivatedCompanyId, user_id: userId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: activeProjectId,
            company_id: companyId,
            name: 'Active Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Archived Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: new Date().toISOString(),
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
          {
            id: hiddenProjectId,
            company_id: deactivatedCompanyId,
            name: 'Hidden Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: activeProjectId, user_id: userId, role: 'member' },
          { project_id: archivedProjectId, user_id: userId, role: 'member' },
          { project_id: hiddenProjectId, user_id: userId, role: 'member' },
        ])
        .execute();

      const listed = await listProjectsServer({
        context: { session: { userId } },
        companyId,
      });
      assert.deepEqual(
        listed.map((project) => project.id),
        [activeProjectId]
      );

      const deactivatedListed = await listProjectsServer({
        context: { session: { userId } },
        companyId: deactivatedCompanyId,
      });
      assert.deepEqual(deactivatedListed, []);

      const activeProject = await getProjectServer({
        context: { session: { userId } },
        projectId: activeProjectId,
      });
      assert.equal(activeProject?.id, activeProjectId);

      await assertAppError(
        () =>
          getProjectServer({
            context: { session: { userId } },
            projectId: archivedProjectId,
          }),
        'FORBIDDEN',
        'Project is deactivated'
      );

      const hiddenProject = await getProjectServer({
        context: { session: { userId } },
        projectId: hiddenProjectId,
      });
      assert.equal(hiddenProject, null);
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'real mutation server functions reject unauthorized roles and deactivated resources',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_mutation_co_1');
    const deactivatedCompanyId = asCompanyId('itest_mutation_co_2');
    const memberUserId = asUserId('itest_mutation_usr_member');
    const viewerUserId = asUserId('itest_mutation_usr_viewer');
    const activeProjectId = asProjectId('itest_mutation_prj_active');
    const archivedProjectId = asProjectId('itest_mutation_prj_archived');
    const deactivatedCompanyProjectId = asProjectId(
      'itest_mutation_prj_hidden'
    );
    const budgetId = asBudgetLineId('itest_mutation_budget_1');
    const txnId = asTxnId('itest_mutation_txn_1');
    const commentId = asTxnCommentId('itest_mutation_comment_1');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Mutation Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: deactivatedCompanyId,
            name: 'Deactivated Mutation Company',
            status: 'deactivated',
            deactivated_at: new Date().toISOString(),
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: memberUserId,
            email: 'mutation-member@example.com',
            name: 'Mutation Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: viewerUserId,
            email: 'mutation-viewer@example.com',
            name: 'Mutation Viewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
          {
            company_id: deactivatedCompanyId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: activeProjectId,
            company_id: companyId,
            name: 'Active Mutation Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Archived Mutation Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: new Date().toISOString(),
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
          {
            id: deactivatedCompanyProjectId,
            company_id: deactivatedCompanyId,
            name: 'Company Down Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          {
            project_id: activeProjectId,
            user_id: memberUserId,
            role: 'member',
          },
          {
            project_id: activeProjectId,
            user_id: viewerUserId,
            role: 'viewer',
          },
          {
            project_id: archivedProjectId,
            user_id: memberUserId,
            role: 'member',
          },
          {
            project_id: deactivatedCompanyProjectId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
        .execute();

      await db
        .insertInto('budget_lines')
        .values({
          id: budgetId,
          company_id: companyId,
          project_id: activeProjectId,
          category_id: null,
          sub_category_id: null,
          allocated_cents: 5_000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'mutation-ext-1',
          company_id: companyId,
          project_id: activeProjectId,
          txn_date: '2026-05-01',
          item: 'Mutation Item',
          description: 'Mutation Description',
          amount_cents: 1200,
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('txn_comments')
        .values({
          id: commentId,
          company_id: companyId,
          project_id: activeProjectId,
          txn_public_id: txnId,
          parent_comment_id: null,
          body: 'Existing comment',
          assigned_to_user_id: null,
          created_by_user_id: memberUserId,
          resolved_at: null,
          resolved_by_user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await assertAppError(
        () =>
          updateTxnServer({
            context: { session: { userId: viewerUserId } },
            projectId: activeProjectId,
            input: { id: txnId, item: 'Changed by viewer' },
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          deleteBudgetServer({
            context: { session: { userId: viewerUserId } },
            projectId: activeProjectId,
            budgetId,
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          createTransactionCommentServer({
            context: { session: { userId: viewerUserId } },
            projectId: activeProjectId,
            input: {
              txnId,
              body: 'Viewer comment should be blocked',
            },
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          upsertProjectMembershipServer({
            context: { session: { userId: memberUserId } },
            projectId: activeProjectId,
            userId: viewerUserId,
            role: 'member',
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          deleteCompanyMembershipServer({
            context: { session: { userId: memberUserId } },
            companyId,
            userId: viewerUserId,
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          createBudgetServer({
            context: { session: { userId: memberUserId } },
            projectId: archivedProjectId,
            input: {
              companyId,
              projectId: archivedProjectId,
              allocatedCents: 100,
            },
          }),
        'FORBIDDEN',
        'Project is deactivated'
      );

      await assertAppError(
        () =>
          createBudgetServer({
            context: { session: { userId: memberUserId } },
            projectId: deactivatedCompanyProjectId,
            input: {
              companyId: deactivatedCompanyId,
              projectId: deactivatedCompanyProjectId,
              allocatedCents: 100,
            },
          }),
        'FORBIDDEN',
        'Company is deactivated'
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'non-superadmin user listings stay scoped to active shared companies and omit admin-only flags',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_userscope_co_1');
    const deactivatedCompanyId = asCompanyId('itest_userscope_co_2');
    const callerUserId = asUserId('itest_userscope_usr_caller');
    const sharedUserId = asUserId('itest_userscope_usr_shared');
    const deactivatedUserId = asUserId('itest_userscope_usr_old');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [callerUserId, sharedUserId, deactivatedUserId])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'User Scope Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: deactivatedCompanyId,
            name: 'User Scope Old Company',
            status: 'deactivated',
            deactivated_at: new Date().toISOString(),
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: callerUserId,
            email: 'caller@example.com',
            name: 'Caller User',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: sharedUserId,
            email: 'shared@example.com',
            name: 'Shared User',
            disabled: true,
            disabled_reason: 'company_deactivated',
            is_global_superadmin: true,
          },
          {
            id: deactivatedUserId,
            email: 'old@example.com',
            name: 'Old User',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: callerUserId, role: 'member' },
          { company_id: companyId, user_id: sharedUserId, role: 'member' },
          {
            company_id: deactivatedCompanyId,
            user_id: callerUserId,
            role: 'member',
          },
          {
            company_id: deactivatedCompanyId,
            user_id: deactivatedUserId,
            role: 'member',
          },
        ])
        .execute();

      const users = await listUsersServer({
        context: { session: { userId: callerUserId } },
      });
      assert.deepEqual(
        users.map((user) => user.id).sort(),
        [callerUserId, sharedUserId].sort()
      );
      assert.equal(
        users.some((user) => user.id === deactivatedUserId),
        false
      );
      const sharedUser = users.find((user) => user.id === sharedUserId);
      assert.equal(sharedUser?.disabled, undefined);
      assert.equal(sharedUser?.isGlobalSuperadmin, undefined);

      const memberships = await listAllCompanyMembershipsServer({
        context: { session: { userId: callerUserId } },
      });
      assert.equal(
        memberships.some(
          (membership) => membership.companyId === deactivatedCompanyId
        ),
        false
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [callerUserId, sharedUserId, deactivatedUserId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'protected company/project/transaction route surface rejects unauthenticated access',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_routeauth_co_1');
    const otherCompanyId = asCompanyId('itest_routeauth_co_2');
    const adminUserId = asUserId('itest_routeauth_usr_admin');
    const execUserId = asUserId('itest_routeauth_usr_exec');
    const managementUserId = asUserId('itest_routeauth_usr_mgmt');
    const memberUserId = asUserId('itest_routeauth_usr_member');
    const viewerUserId = asUserId('itest_routeauth_usr_viewer');
    const outsiderUserId = asUserId('itest_routeauth_usr_outsider');
    const inviteUserId = asUserId('itest_routeauth_usr_invite');
    const projectId = asProjectId('itest_routeauth_prj_1');
    const secondProjectId = asProjectId('itest_routeauth_prj_2');
    const otherProjectId = asProjectId('itest_routeauth_prj_3');
    const archivedProjectId = asProjectId('itest_routeauth_prj_4');
    const categoryId = asCategoryId('itest_routeauth_cat_1');
    const subCategoryId = asSubCategoryId('itest_routeauth_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_routeauth_ccat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_routeauth_csub_1'
    );
    const defaultMappingRuleId = asCompanyDefaultMappingRuleId(
      'itest_routeauth_map_1'
    );
    const importRuleId = asImportRuleId('itest_routeauth_rule_1');
    const budgetId = asBudgetLineId('itest_routeauth_budget_1');
    const txnId = asTxnId('itest_routeauth_txn_1');
    const commentId = asTxnCommentId('itest_routeauth_comment_1');
    const importBatchId = asImportBatchId('itest_routeauth_batch_1');
    const importCandidateId = asImportCandidateId(
      'itest_routeauth_candidate_1'
    );
    const now = new Date().toISOString();

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [
          adminUserId,
          execUserId,
          managementUserId,
          memberUserId,
          viewerUserId,
          outsiderUserId,
          inviteUserId,
        ])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Route Auth Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: otherCompanyId,
            name: 'Route Auth Other Company',
            status: 'active',
            deactivated_at: null,
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: adminUserId,
            email: 'route-admin@example.com',
            name: 'Route Admin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: execUserId,
            email: 'route-exec@example.com',
            name: 'Route Exec',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: managementUserId,
            email: 'route-mgmt@example.com',
            name: 'Route Management',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: memberUserId,
            email: 'route-member@example.com',
            name: 'Route Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: viewerUserId,
            email: 'route-viewer@example.com',
            name: 'Route Viewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: outsiderUserId,
            email: 'route-outsider@example.com',
            name: 'Route Outsider',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: inviteUserId,
            email: 'route-invite@example.com',
            name: 'Route Invite',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: adminUserId, role: 'admin' },
          { company_id: companyId, user_id: execUserId, role: 'executive' },
          {
            company_id: companyId,
            user_id: managementUserId,
            role: 'management',
          },
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
          {
            company_id: otherCompanyId,
            user_id: outsiderUserId,
            role: 'admin',
          },
          { company_id: companyId, user_id: inviteUserId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Route Auth Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 10_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: secondProjectId,
            company_id: companyId,
            name: 'Route Auth Destination Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 5_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: otherProjectId,
            company_id: otherCompanyId,
            name: 'Route Auth Other Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 3_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Route Auth Archived Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: now,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: adminUserId, role: 'owner' },
          { project_id: projectId, user_id: execUserId, role: 'lead' },
          { project_id: projectId, user_id: memberUserId, role: 'member' },
          { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
          { project_id: projectId, user_id: inviteUserId, role: 'member' },
          { project_id: secondProjectId, user_id: adminUserId, role: 'owner' },
          { project_id: secondProjectId, user_id: execUserId, role: 'lead' },
          {
            project_id: otherProjectId,
            user_id: outsiderUserId,
            role: 'owner',
          },
          {
            project_id: archivedProjectId,
            user_id: adminUserId,
            role: 'owner',
          },
          {
            project_id: archivedProjectId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
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
          name: 'Default Travel',
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Default Flights',
        })
        .execute();
      await db
        .insertInto('company_default_mapping_rules')
        .values({
          id: defaultMappingRuleId,
          company_id: companyId,
          match_text: 'flight',
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: defaultSubCategoryId,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_rules')
        .values({
          id: importRuleId,
          company_id: companyId,
          name: 'Route Import Rule',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'ignore-me',
          sort_order: 99,
          enabled: true,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('budget_lines')
        .values({
          id: budgetId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryId,
          sub_category_id: subCategoryId,
          allocated_cents: 5_000,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'route-auth-ext-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-05-01',
          item: 'Route Auth Item',
          description: 'Route Auth Description',
          amount_cents: 1_250,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: categoryId,
          sub_category_id: subCategoryId,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txn_comments')
        .values({
          id: commentId,
          company_id: companyId,
          project_id: projectId,
          txn_public_id: txnId,
          parent_comment_id: null,
          body: 'Existing route comment',
          assigned_to_user_id: memberUserId,
          created_by_user_id: adminUserId,
          resolved_at: null,
          resolved_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_batches')
        .values({
          id: importBatchId,
          company_id: companyId,
          project_id: projectId,
          source_type: 'powerbi_expenditure_actuals',
          file_name: 'route-auth.csv',
          status: 'previewed',
          created_by_user_id: adminUserId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_candidates')
        .values({
          id: importCandidateId,
          company_id: companyId,
          project_id: projectId,
          batch_id: importBatchId,
          source_row_index: 0,
          preview_import_id: 'preview-1',
          raw_row: { description: 'Candidate Row' },
          status: 'needs_project_review',
          matched_import_rule_id: importRuleId,
          status_reason: 'Needs review',
          txn_public_id: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const api = createRouteApi(null);
      const unauthenticatedOps: Array<{
        route: string;
        run: (api: RouteApi) => Promise<unknown>;
      }> = [
        { route: 'GET /api/users', run: (x) => x.listUsers() },
        { route: 'GET /api/companies', run: (x) => x.listCompanies() },
        {
          route: 'POST /api/companies',
          run: (x) =>
            x.createCompany({
              name: 'Unauthed Company',
              initialAdminName: 'Unauthed Admin',
              initialAdminEmail: 'unauthed-admin@example.com',
            }),
        },
        {
          route: 'GET /api/companies/:companyId',
          run: (x) => x.getCompany(companyId),
        },
        {
          route: 'PATCH /api/companies/:companyId',
          run: (x) => x.updateCompany({ id: companyId, name: 'Renamed' }),
        },
        {
          route: 'DELETE /api/companies/:companyId',
          run: (x) =>
            x.deleteCompany({
              companyId,
              confirmation: 'DELETE Route Auth Company',
            }),
        },
        {
          route: 'POST /api/companies/:companyId/deactivate',
          run: (x) => x.deactivateCompany(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/reactivate',
          run: (x) => x.reactivateCompany(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/summary',
          run: (x) => x.getCompanySummary(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/defaults',
          run: (x) => x.getCompanyDefaults(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/projects',
          run: (x) => x.listProjects(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/projects',
          run: (x) => x.createProject(companyId, { name: 'Created Project' }),
        },
        {
          route: 'GET /api/companies/:companyId/memberships',
          run: (x) => x.listCompanyMemberships(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/memberships',
          run: (x) =>
            x.upsertCompanyMembership(companyId, inviteUserId, 'member'),
        },
        {
          route: 'DELETE /api/companies/:companyId/memberships',
          run: (x) => x.deleteCompanyMembership(companyId, inviteUserId),
        },
        {
          route: 'GET /api/companies/:companyId/my-project-memberships',
          run: (x) => x.listMyProjectMemberships(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/users',
          run: (x) =>
            x.createUserInCompany(companyId, {
              name: 'Invite Pending',
              email: 'pending@example.com',
              role: 'member',
            }),
        },
        {
          route: 'POST /api/companies/:companyId/users/:userId/invite',
          run: (x) => x.sendCompanyUserInviteEmail(companyId, inviteUserId),
        },
        {
          route: 'GET /api/companies/:companyId/default-categories',
          run: (x) => x.listCompanyDefaultCategories(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/default-categories',
          run: (x) =>
            x.createCompanyDefaultCategory(companyId, {
              companyId,
              name: 'New Default Category',
            }),
        },
        {
          route:
            'DELETE /api/companies/:companyId/default-categories/:categoryId',
          run: (x) =>
            x.deleteCompanyDefaultCategory(companyId, defaultCategoryId),
        },
        {
          route: 'GET /api/companies/:companyId/default-sub-categories',
          run: (x) => x.listCompanyDefaultSubCategories(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/default-sub-categories',
          run: (x) =>
            x.createCompanyDefaultSubCategory(companyId, {
              companyId,
              companyDefaultCategoryId: defaultCategoryId,
              name: 'New Default SubCategory',
            }),
        },
        {
          route:
            'DELETE /api/companies/:companyId/default-sub-categories/:subCategoryId',
          run: (x) =>
            x.deleteCompanyDefaultSubCategory(companyId, defaultSubCategoryId),
        },
        {
          route: 'GET /api/companies/:companyId/default-mapping-rules',
          run: (x) => x.listCompanyDefaultMappingRules(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/default-mapping-rules',
          run: (x) =>
            x.createCompanyDefaultMappingRule(companyId, {
              companyId,
              matchText: 'hotel',
              companyDefaultCategoryId: defaultCategoryId,
              companyDefaultSubCategoryId: defaultSubCategoryId,
              sortOrder: 1,
            }),
        },
        {
          route:
            'DELETE /api/companies/:companyId/default-mapping-rules/:ruleId',
          run: (x) =>
            x.deleteCompanyDefaultMappingRule(companyId, defaultMappingRuleId),
        },
        {
          route: 'GET /api/companies/:companyId/import-rules',
          run: (x) => x.listImportRules(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/import-rules',
          run: (x) =>
            x.createImportRule(companyId, {
              companyId,
              name: 'Block Payroll',
              action: 'exclude',
              field: 'journalLineDescription',
              operator: 'contains_any',
              value: 'salary,payroll',
              sortOrder: 3,
              enabled: true,
            }),
        },
        {
          route: 'DELETE /api/companies/:companyId/import-rules/:ruleId',
          run: (x) => x.deleteImportRule(companyId, importRuleId),
        },
        {
          route: 'GET /api/memberships/companies',
          run: (x) => x.listAllCompanyMemberships(),
        },
        {
          route: 'GET /api/projects/:projectId',
          run: (x) => x.getProject(projectId),
        },
        {
          route: 'PATCH /api/projects/:projectId',
          run: (x) =>
            x.updateProject({ id: projectId, name: 'Changed Project' }),
        },
        {
          route: 'DELETE /api/projects/:projectId',
          run: (x) =>
            x.deleteProject({
              projectId,
              confirmation: 'DELETE Route Auth Project',
            }),
        },
        {
          route: 'POST /api/projects/:projectId/deactivate',
          run: (x) => x.deactivateProject(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/reactivate',
          run: (x) => x.reactivateProject(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/memberships',
          run: (x) => x.listProjectMemberships(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/memberships',
          run: (x) =>
            x.upsertProjectMembership(projectId, inviteUserId, 'member'),
        },
        {
          route: 'DELETE /api/projects/:projectId/memberships',
          run: (x) =>
            x.deleteProjectMembership(projectId, inviteUserId, 'member'),
        },
        {
          route: 'POST /api/projects/:projectId/apply-company-default-taxonomy',
          run: (x) => x.applyCompanyDefaultTaxonomy(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/categories',
          run: (x) => x.listCategories(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/categories',
          run: (x) =>
            x.createCategory(projectId, {
              companyId,
              projectId,
              name: 'Meals',
            }),
        },
        {
          route: 'DELETE /api/projects/:projectId/categories/:categoryId',
          run: (x) => x.deleteCategory(projectId, categoryId),
        },
        {
          route: 'GET /api/projects/:projectId/sub-categories',
          run: (x) => x.listSubCategories(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/sub-categories',
          run: (x) =>
            x.createSubCategory(projectId, {
              companyId,
              projectId,
              categoryId,
              name: 'Dinner',
            }),
        },
        {
          route:
            'DELETE /api/projects/:projectId/sub-categories/:subCategoryId',
          run: (x) => x.deleteSubCategory(projectId, subCategoryId),
        },
        {
          route: 'GET /api/projects/:projectId/budgets',
          run: (x) => x.listBudgets(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/budgets',
          run: (x) =>
            x.createBudget(projectId, {
              companyId,
              projectId,
              categoryId,
              subCategoryId,
              allocatedCents: 2_000,
            }),
        },
        {
          route: 'DELETE /api/projects/:projectId/budgets/:budgetId',
          run: (x) => x.deleteBudget(projectId, budgetId),
        },
        {
          route: 'GET /api/projects/:projectId/transactions',
          run: (x) => x.listTransactions(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/transactions?mode=page',
          run: (x) =>
            x.listTransactionsPage(projectId, {
              pageIndex: 0,
              pageSize: 20,
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions',
          run: (x) =>
            x.createTxn(projectId, {
              companyId,
              projectId,
              date: '2026-05-02',
              item: 'Created Item',
              description: 'Created Description',
              amountCents: 550,
              externalId: 'created-ext-1',
              categoryId,
              subCategoryId,
            }),
        },
        {
          route: 'PATCH /api/projects/:projectId/transactions',
          run: (x) =>
            x.updateTxn(projectId, {
              id: txnId,
              item: 'Changed Item',
            }),
        },
        {
          route: 'DELETE /api/projects/:projectId/transactions/:txnId',
          run: (x) => x.deleteTxn(projectId, txnId),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/split',
          run: (x) =>
            x.splitTxn(projectId, {
              txnId,
              children: [{ amountCents: 600 }, { amountCents: 650 }],
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/transfer',
          run: (x) =>
            x.transferTxn(projectId, {
              txnId,
              destinationProjectId: secondProjectId,
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/workflow',
          run: (x) =>
            x.updateTxnWorkflowState(projectId, {
              txnId,
              reviewed: true,
            }),
        },
        {
          route: 'GET /api/projects/:projectId/transactions/comment-summaries',
          run: (x) => x.listTransactionCommentSummaries(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/transactions/:txnId/comments',
          run: (x) => x.listTransactionComments(projectId, txnId),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/comments',
          run: (x) =>
            x.createTransactionComment(projectId, {
              txnId,
              body: 'Please review',
            }),
        },
        {
          route:
            'PATCH /api/projects/:projectId/transactions/:txnId/comments/:commentId',
          run: (x) =>
            x.updateTransactionComment(projectId, txnId, {
              id: commentId,
              body: 'Updated body',
            }),
        },
        {
          route:
            'DELETE /api/projects/:projectId/transactions/:txnId/comments/:commentId',
          run: (x) => x.deleteTransactionComment(projectId, txnId, commentId),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/import-preview',
          run: (x) =>
            x.previewImportTransactions(projectId, {
              csvText: [
                'Date,Item,Description,Amount',
                '2026-05-01,Item,Description,12.34',
              ].join('\n'),
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/import',
          run: (x) =>
            x.importTransactions(projectId, {
              mode: 'append',
              txns: [
                {
                  id: asTxnId('itest_routeauth_import_txn_1'),
                  companyId,
                  projectId,
                  date: '2026-05-03',
                  item: 'Imported',
                  description: 'Imported row',
                  amountCents: 990,
                  externalId: 'imported-ext-1',
                  categoryId,
                  subCategoryId,
                },
              ],
            }),
        },
        {
          route: 'GET /api/projects/:projectId/import-candidates',
          run: (x) => x.listImportCandidates(projectId),
        },
        {
          route:
            'POST /api/projects/:projectId/import-candidates/:candidateId/review',
          run: (x) =>
            x.reviewImportCandidate(projectId, {
              candidateId: importCandidateId,
              decision: 'reject',
            }),
        },
        {
          route: 'POST /api/projects/:projectId/import-batches/:batchId/cancel',
          run: (x) => x.cancelImportPreview(projectId, importBatchId),
        },
      ];

      for (const op of unauthenticatedOps) {
        await assertAppErrorCode(
          () => op.run(api),
          'UNAUTHENTICATED',
          op.route
        );
      }
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [
          adminUserId,
          execUserId,
          managementUserId,
          memberUserId,
          viewerUserId,
          outsiderUserId,
          inviteUserId,
        ])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'route-backed company/project/transaction actions enforce tenant and role authorization',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_routeauthz_co_1');
    const otherCompanyId = asCompanyId('itest_routeauthz_co_2');
    const adminUserId = asUserId('itest_routeauthz_usr_admin');
    const managementUserId = asUserId('itest_routeauthz_usr_mgmt');
    const memberUserId = asUserId('itest_routeauthz_usr_member');
    const viewerUserId = asUserId('itest_routeauthz_usr_viewer');
    const outsiderUserId = asUserId('itest_routeauthz_usr_outsider');
    const inviteUserId = asUserId('itest_routeauthz_usr_invite');
    const projectId = asProjectId('itest_routeauthz_prj_1');
    const secondProjectId = asProjectId('itest_routeauthz_prj_2');
    const otherProjectId = asProjectId('itest_routeauthz_prj_3');
    const archivedProjectId = asProjectId('itest_routeauthz_prj_4');
    const categoryId = asCategoryId('itest_routeauthz_cat_1');
    const subCategoryId = asSubCategoryId('itest_routeauthz_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_routeauthz_ccat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_routeauthz_csub_1'
    );
    const defaultMappingRuleId = asCompanyDefaultMappingRuleId(
      'itest_routeauthz_map_1'
    );
    const importRuleId = asImportRuleId('itest_routeauthz_rule_1');
    const budgetId = asBudgetLineId('itest_routeauthz_budget_1');
    const txnId = asTxnId('itest_routeauthz_txn_1');
    const commentId = asTxnCommentId('itest_routeauthz_comment_1');
    const importBatchId = asImportBatchId('itest_routeauthz_batch_1');
    const importCandidateId = asImportCandidateId(
      'itest_routeauthz_candidate_1'
    );
    const now = new Date().toISOString();

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [
          adminUserId,
          managementUserId,
          memberUserId,
          viewerUserId,
          outsiderUserId,
          inviteUserId,
        ])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Route AuthZ Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: otherCompanyId,
            name: 'Route AuthZ Other Company',
            status: 'active',
            deactivated_at: null,
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: adminUserId,
            email: 'route-authz-admin@example.com',
            name: 'Route AuthZ Admin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: managementUserId,
            email: 'route-authz-mgmt@example.com',
            name: 'Route AuthZ Management',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: memberUserId,
            email: 'route-authz-member@example.com',
            name: 'Route AuthZ Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: viewerUserId,
            email: 'route-authz-viewer@example.com',
            name: 'Route AuthZ Viewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: outsiderUserId,
            email: 'route-authz-outsider@example.com',
            name: 'Route AuthZ Outsider',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: inviteUserId,
            email: 'route-authz-invite@example.com',
            name: 'Route AuthZ Invite',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: adminUserId, role: 'admin' },
          {
            company_id: companyId,
            user_id: managementUserId,
            role: 'management',
          },
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
          {
            company_id: otherCompanyId,
            user_id: outsiderUserId,
            role: 'admin',
          },
          { company_id: companyId, user_id: inviteUserId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Route AuthZ Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 7_500,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: secondProjectId,
            company_id: companyId,
            name: 'Route AuthZ Destination Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 2_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: otherProjectId,
            company_id: otherCompanyId,
            name: 'Route AuthZ Other Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 1_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Route AuthZ Archived Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: now,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: adminUserId, role: 'owner' },
          { project_id: projectId, user_id: memberUserId, role: 'member' },
          { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
          { project_id: projectId, user_id: inviteUserId, role: 'member' },
          { project_id: secondProjectId, user_id: adminUserId, role: 'owner' },
          {
            project_id: otherProjectId,
            user_id: outsiderUserId,
            role: 'owner',
          },
          {
            project_id: archivedProjectId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
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
          name: 'Default Travel',
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Default Flights',
        })
        .execute();
      await db
        .insertInto('company_default_mapping_rules')
        .values({
          id: defaultMappingRuleId,
          company_id: companyId,
          match_text: 'flight',
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: defaultSubCategoryId,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_rules')
        .values({
          id: importRuleId,
          company_id: companyId,
          name: 'Route AuthZ Import Rule',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'ignore-me',
          sort_order: 99,
          enabled: true,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('budget_lines')
        .values({
          id: budgetId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryId,
          sub_category_id: subCategoryId,
          allocated_cents: 4_000,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'route-authz-ext-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-05-01',
          item: 'Route AuthZ Item',
          description: 'Route AuthZ Description',
          amount_cents: 1_100,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: categoryId,
          sub_category_id: subCategoryId,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txn_comments')
        .values({
          id: commentId,
          company_id: companyId,
          project_id: projectId,
          txn_public_id: txnId,
          parent_comment_id: null,
          body: 'Existing route authz comment',
          assigned_to_user_id: memberUserId,
          created_by_user_id: adminUserId,
          resolved_at: null,
          resolved_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_batches')
        .values({
          id: importBatchId,
          company_id: companyId,
          project_id: projectId,
          source_type: 'powerbi_expenditure_actuals',
          file_name: 'route-authz.csv',
          status: 'previewed',
          created_by_user_id: adminUserId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_candidates')
        .values({
          id: importCandidateId,
          company_id: companyId,
          project_id: projectId,
          batch_id: importBatchId,
          source_row_index: 0,
          preview_import_id: 'preview-1',
          raw_row: { description: 'Candidate Row' },
          status: 'needs_project_review',
          matched_import_rule_id: importRuleId,
          status_reason: 'Needs review',
          txn_public_id: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const managementApi = createRouteApi(managementUserId);
      const memberApi = createRouteApi(memberUserId);
      const viewerApi = createRouteApi(viewerUserId);
      const outsiderApi = createRouteApi(outsiderUserId);

      assert.equal(await outsiderApi.getCompany(companyId), null);
      assert.deepEqual(await outsiderApi.listProjects(companyId), []);
      await assertAppErrorCode(
        () => outsiderApi.getProject(projectId),
        'FORBIDDEN',
        'GET /api/projects/:projectId outsider'
      );
      await assertAppErrorCode(
        () => outsiderApi.listCompanyMemberships(companyId),
        'FORBIDDEN',
        'GET /api/companies/:companyId/memberships outsider'
      );

      await assertAppErrorCode(
        () => managementApi.getCompanySummary(companyId),
        'FORBIDDEN',
        'GET /api/companies/:companyId/summary management'
      );
      await assertAppErrorCode(
        () => managementApi.createProject(companyId, { name: 'Nope' }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/projects management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.createCompanyDefaultCategory(companyId, {
            companyId,
            name: 'Nope',
          }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/default-categories management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.updateCompanyDefaultSubCategory(companyId, {
            id: defaultSubCategoryId,
            name: 'Blocked',
          }),
        'FORBIDDEN',
        'PATCH /api/companies/:companyId/default-sub-categories/:subCategoryId management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.deleteCompanyDefaultMappingRule(
            companyId,
            defaultMappingRuleId
          ),
        'FORBIDDEN',
        'DELETE /api/companies/:companyId/default-mapping-rules/:ruleId management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.createImportRule(companyId, {
            companyId,
            name: 'Blocked',
            action: 'exclude',
            field: 'journalLineDescription',
            operator: 'contains',
            value: 'blocked',
            sortOrder: 1,
            enabled: true,
          }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/import-rules management'
      );

      await assertAppErrorCode(
        () =>
          memberApi.upsertCompanyMembership(companyId, inviteUserId, 'member'),
        'FORBIDDEN',
        'POST /api/companies/:companyId/memberships member'
      );
      await assertAppErrorCode(
        () => memberApi.deleteCompanyMembership(companyId, inviteUserId),
        'FORBIDDEN',
        'DELETE /api/companies/:companyId/memberships member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.createUserInCompany(companyId, {
            name: 'Blocked Invite',
            email: 'blocked-invite@example.com',
            role: 'member',
          }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/users member'
      );
      await assertAppErrorCode(
        () => memberApi.sendCompanyUserInviteEmail(companyId, inviteUserId),
        'FORBIDDEN',
        'POST /api/companies/:companyId/users/:userId/invite member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.upsertProjectMembership(projectId, inviteUserId, 'member'),
        'FORBIDDEN',
        'POST /api/projects/:projectId/memberships member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.deleteProjectMembership(projectId, inviteUserId, 'member'),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/memberships member'
      );
      await assertAppErrorCode(
        () => memberApi.applyCompanyDefaultTaxonomy(projectId),
        'FORBIDDEN',
        'POST /api/projects/:projectId/apply-company-default-taxonomy member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.createCategory(projectId, {
            companyId,
            projectId,
            name: 'Blocked Category',
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/categories member'
      );
      await assertAppErrorCode(
        () => memberApi.deleteSubCategory(projectId, subCategoryId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/sub-categories/:subCategoryId member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.updateProject({
            id: projectId,
            allowTxnTransfers: false,
          }),
        'FORBIDDEN',
        'PATCH /api/projects/:projectId configure member'
      );
      await assertAppErrorCode(
        () => memberApi.deactivateProject(projectId),
        'FORBIDDEN',
        'POST /api/projects/:projectId/deactivate member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.previewImportTransactions(projectId, {
            csvText: [
              'Date,Item,Description,Amount',
              '2026-05-01,Item,Description,12.34',
            ].join('\n'),
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/import-preview member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.importTransactions(projectId, {
            mode: 'append',
            txns: [
              {
                id: asTxnId('itest_routeauthz_import_txn_1'),
                companyId,
                projectId,
                date: '2026-05-03',
                item: 'Blocked Import',
                description: 'Blocked Import',
                amountCents: 990,
                externalId: 'blocked-import-ext',
                categoryId,
                subCategoryId,
              },
            ],
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/import member'
      );
      await assertAppErrorCode(
        () => memberApi.listImportCandidates(projectId),
        'FORBIDDEN',
        'GET /api/projects/:projectId/import-candidates member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.reviewImportCandidate(projectId, {
            candidateId: importCandidateId,
            decision: 'reject',
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/import-candidates/:candidateId/review member'
      );
      await assertAppErrorCode(
        () => memberApi.cancelImportPreview(projectId, importBatchId),
        'FORBIDDEN',
        'POST /api/projects/:projectId/import-batches/:batchId/cancel member'
      );

      await assertAppErrorCode(
        () =>
          viewerApi.createBudget(projectId, {
            companyId,
            projectId,
            categoryId,
            subCategoryId,
            allocatedCents: 2_000,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/budgets viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.deleteBudget(projectId, budgetId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/budgets/:budgetId viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.createTxn(projectId, {
            companyId,
            projectId,
            date: '2026-05-02',
            item: 'Blocked Txn',
            description: 'Blocked Txn',
            amountCents: 550,
            externalId: 'blocked-txn-ext',
            categoryId,
            subCategoryId,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.updateTxn(projectId, { id: txnId, item: 'Blocked' }),
        'FORBIDDEN',
        'PATCH /api/projects/:projectId/transactions viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.deleteTxn(projectId, txnId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/transactions/:txnId viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.splitTxn(projectId, {
            txnId,
            children: [{ amountCents: 500 }, { amountCents: 600 }],
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/split viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.transferTxn(projectId, {
            txnId,
            destinationProjectId: secondProjectId,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/transfer viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.updateTxnWorkflowState(projectId, {
            txnId,
            reviewed: true,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/workflow viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.createTransactionComment(projectId, {
            txnId,
            body: 'Blocked comment',
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/comments viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.updateTransactionComment(projectId, txnId, {
            id: commentId,
            body: 'Blocked edit',
          }),
        'FORBIDDEN',
        'PATCH /api/projects/:projectId/transactions/:txnId/comments/:commentId viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.deleteTransactionComment(projectId, txnId, commentId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/transactions/:txnId/comments/:commentId viewer'
      );

      await assertAppError(
        () => memberApi.getProject(archivedProjectId),
        'FORBIDDEN',
        'Project is deactivated'
      );
      assert.deepEqual(await outsiderApi.listProjects(companyId), []);
      assert.equal(await outsiderApi.getCompany(companyId), null);
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [
          adminUserId,
          managementUserId,
          memberUserId,
          viewerUserId,
          outsiderUserId,
          inviteUserId,
        ])
        .execute();
      await db.destroy();
    }
  }
);
