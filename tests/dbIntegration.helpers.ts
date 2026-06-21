import assert from 'node:assert/strict';

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
  TxnBulkActionInput,
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
import { createPgPool } from '../src/server/db/pgPool.ts';
import type { DB } from '../src/server/db/schema.ts';
import {
  createBudgetServer,
  deleteBudgetServer,
  listBudgetsServer,
  updateBudgetServer,
} from '../src/server/fns/budgets.ts';
import {
  createCompanyServer,
  createUserInCompanyServer,
  deactivateCompanyServer,
  deleteCompanyServer,
  getCompanyServer,
  getCompanySummaryServer,
  listCompaniesServer,
  listUsersServer,
  reactivateCompanyServer,
  sendCompanyUserInviteEmailServer,
  updateCompanyServer,
} from '../src/server/fns/companies.ts';
import {
  createCompanyExportJobServer,
  downloadCompanyExportJobServer,
  getCompanyExportJobServer,
  getLatestCompanyExportJobServer,
} from '../src/server/fns/exportJobs.ts';
import {
  createImportRuleServer,
  deleteImportRuleServer,
  listImportRulesServer,
} from '../src/server/fns/importRules.ts';
import {
  deleteCompanyMembershipServer,
  deleteProjectMembershipServer,
  listAllCompanyMembershipsServer,
  listCompanyMembershipsServer,
  listMyProjectMembershipsServer,
  listProjectMembershipsServer,
  upsertCompanyMembershipServer,
  upsertProjectMembershipServer,
} from '../src/server/fns/memberships.ts';
import {
  createProjectAutoCodingRuleServer,
  deleteProjectAutoCodingRuleServer,
  getProjectRuleSuggestionPromptServer,
  listProjectAutoCodingRulesServer,
  updateProjectAutoCodingRuleServer,
} from '../src/server/fns/projectAutoCodingRules.ts';
import {
  createProjectServer,
  deactivateProjectServer,
  deleteProjectServer,
  getProjectServer,
  listProjectsServer,
  reactivateProjectServer,
  updateProjectServer,
} from '../src/server/fns/projects.ts';
import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import {
  applyCompanyStandardsServer,
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
  bulkTxnActionServer,
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
  createTransactionCommentServer,
  deleteTransactionCommentServer,
  listTransactionCommentSummariesServer,
  listTransactionCommentsServer,
  updateTransactionCommentServer,
} from '../src/server/fns/transactionComments.ts';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyExportJobId,
  asCompanyId,
  asImportBatchId,
  asImportRuleId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
  type CompanyRole,
  type ProjectRole,
} from '../src/types/index.ts';

export const integrationDatabaseUrl =
  process.env.PROJEX_INTEGRATION_DATABASE_URL?.trim() ?? '';
export const integrationExportStorageConfigured =
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

export function createIntegrationDb() {
  assertTestDatabaseUrl(integrationDatabaseUrl);
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: createPgPool(
        integrationDatabaseUrl
      ) as unknown as PostgresDialectConfig['pool'],
    }),
  });
}

export async function assertAppError(
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

export async function assertAppErrorCode(
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

export function createRouteApi(userId?: ReturnType<typeof asUserId> | null) {
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
    applyCompanyStandards: (projectId: ReturnType<typeof asProjectId>) =>
      applyCompanyStandardsServer({ context, projectId }),
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
    bulkTxnAction: (
      projectId: ReturnType<typeof asProjectId>,
      input: TxnBulkActionInput
    ) => bulkTxnActionServer({ context, projectId, input }),
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
    getLatestCompanyExportJob: (companyId: ReturnType<typeof asCompanyId>) =>
      getLatestCompanyExportJobServer({ context, companyId }),
    downloadCompanyExportJob: (
      jobId: ReturnType<typeof asCompanyExportJobId>
    ) => downloadCompanyExportJobServer({ context, jobId }),
    createProjectAutoCodingRule: (
      projectId: ReturnType<typeof asProjectId>,
      input: Parameters<typeof createProjectAutoCodingRuleServer>[0]['input']
    ) => createProjectAutoCodingRuleServer({ context, projectId, input }),
    getProjectRuleSuggestionPrompt: (
      projectId: ReturnType<typeof asProjectId>,
      txnId: ReturnType<typeof asTxnId>
    ) => getProjectRuleSuggestionPromptServer({ context, projectId, txnId }),
    listProjectAutoCodingRules: (projectId: ReturnType<typeof asProjectId>) =>
      listProjectAutoCodingRulesServer({ context, projectId }),
    updateProjectAutoCodingRule: (
      projectId: ReturnType<typeof asProjectId>,
      input: Parameters<typeof updateProjectAutoCodingRuleServer>[0]['input']
    ) => updateProjectAutoCodingRuleServer({ context, projectId, input }),
    deleteProjectAutoCodingRule: (
      projectId: ReturnType<typeof asProjectId>,
      ruleId: Parameters<typeof deleteProjectAutoCodingRuleServer>[0]['ruleId']
    ) => deleteProjectAutoCodingRuleServer({ context, projectId, ruleId }),
  };
}

export type RouteApi = ReturnType<typeof createRouteApi>;

export async function waitForExportJobCompletion(args: {
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

export async function insertExportJobFixture(args: {
  db: ReturnType<typeof createIntegrationDb>;
  jobId: ReturnType<typeof asCompanyExportJobId>;
  companyId: ReturnType<typeof asCompanyId>;
  userId: ReturnType<typeof asUserId>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  requestedAt?: string;
  expiresAt?: string | null;
  fileName?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
}) {
  const requestedAt = args.requestedAt ?? new Date().toISOString();
  await args.db
    .insertInto('company_export_jobs')
    .values({
      id: args.jobId,
      company_id: args.companyId,
      created_by_user_id: args.userId,
      scope: 'all',
      detail: 'full',
      status: args.status,
      from_date: null,
      to_date: null,
      notify_when_ready: false,
      notify_email: null,
      ready_notification_status: 'not_requested',
      ready_notification_delivery: null,
      ready_notification_sent_at: null,
      ready_notification_error: null,
      file_name: args.fileName ?? null,
      content_type:
        args.status === 'completed'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : null,
      file_size_bytes: args.status === 'completed' ? 128 : null,
      storage_bucket: args.storageBucket ?? null,
      storage_key: args.storageKey ?? null,
      storage_etag: args.status === 'completed' ? 'fixture-etag' : null,
      error_message: args.status === 'failed' ? 'Fixture failed export' : null,
      requested_at: requestedAt,
      started_at: requestedAt,
      completed_at: args.status === 'completed' ? requestedAt : null,
      failed_at: args.status === 'failed' ? requestedAt : null,
      expires_at:
        args.expiresAt === undefined
          ? args.status === 'completed'
            ? new Date(Date.now() + 60_000).toISOString()
            : null
          : args.expiresAt,
      last_heartbeat_at: requestedAt,
      updated_at: requestedAt,
    })
    .execute();
}
