import { z } from 'zod';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyExportJobId,
  asCompanyDefaultMappingRuleId,
  asCompanyId,
  asImportBatchId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
  TXN_TYPES,
  TXN_REVERSAL_SIDES,
  TXN_REVERSAL_STATUSES,
} from '../types/index.ts';
import type { CompanySummaryProject } from '../types/index.ts';
import {
  budgetAllocatedCentsSchema,
  idSchema,
  projectBudgetTotalCentsSchema,
  transactionAmountCentsSchema,
} from './schemas.ts';

export const apiMessageResponseSchema = z.object({
  message: z.string().optional(),
});

export const apiErrorResponseSchema = z
  .object({
    code: z
      .enum([
        'UNAUTHENTICATED',
        'FORBIDDEN',
        'NOT_FOUND',
        'RATE_LIMITED',
        'VALIDATION_ERROR',
        'CONFLICT',
        'NOT_IMPLEMENTED',
        'INTERNAL_ERROR',
      ])
      .optional(),
    message: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
const companyIdSchema = idSchema.transform(asCompanyId);
const projectIdSchema = idSchema.transform(asProjectId);
const userIdSchema = idSchema.transform(asUserId);
const categoryIdSchema = idSchema.transform(asCategoryId);
const subCategoryIdSchema = idSchema.transform(asSubCategoryId);
const budgetLineIdSchema = idSchema.transform(asBudgetLineId);
const mappingRuleIdSchema = idSchema.transform(asCompanyDefaultMappingRuleId);
const importBatchIdSchema = idSchema.transform(asImportBatchId);
const txnIdSchema = idSchema.transform(asTxnId);
const txnCommentIdSchema = idSchema.transform(asTxnCommentId);
const companyExportJobIdSchema = idSchema.transform(asCompanyExportJobId);
const isoTimestampSchema = z.iso.datetime({ offset: true });
const optionalIsoTimestampSchema = isoTimestampSchema.optional();
const companyRoleSchema = z.enum([
  'admin',
  'executive',
  'management',
  'member',
]);
const projectTypeSchema = z.enum(['project', 'programme']);
const codingSourceSchema = z.enum([
  'manual',
  'company_default_rule',
  'project_rule',
]);
const companyExportReadyNotificationStatusSchema = z.enum([
  'not_requested',
  'pending',
  'sent',
  'failed',
]);
const companyExportReadyNotificationDeliverySchema = z.enum(['email', 'log']);
const projectStandardOriginScopeSchema = z.enum(['company', 'project']);
const projectStandardSyncStatusSchema = z.enum([
  'local',
  'inherited',
  'overridden',
  'detached',
]);

export const authenticatedSessionResponseSchema = z.object({
  userId: userIdSchema,
});

const companyResponseSchema = z.object({
  id: companyIdSchema,
  name: z.string(),
  status: z.enum(['active', 'deactivated']),
  deactivatedAt: optionalIsoTimestampSchema,
});

export const companiesResponseSchema = z.array(companyResponseSchema);

const companySummaryMonthResponseSchema = z.object({
  monthKey: z.string(),
  actualCodedCents: transactionAmountCentsSchema,
  pendingReversalCents: transactionAmountCentsSchema,
  adjustedActualCodedCents: transactionAmountCentsSchema,
  uncodedCount: z.number().int().nonnegative(),
  uncodedAmountCents: transactionAmountCentsSchema,
});

export const companySummaryProjectResponseSchema: z.ZodType<CompanySummaryProject> =
  z.object({
    id: projectIdSchema,
    name: z.string(),
    projectType: projectTypeSchema,
    parentProjectId: projectIdSchema.optional(),
    status: z.enum(['active', 'archived']),
    visibility: z.enum(['company', 'private']),
    currency: z.enum(['AUD', 'USD', 'EUR', 'GBP']),
    budgetCents: projectBudgetTotalCentsSchema,
    months: z.array(companySummaryMonthResponseSchema),
    children: z
      .array(
        z.lazy(
          (): z.ZodType<CompanySummaryProject> =>
            companySummaryProjectResponseSchema
        )
      )
      .optional(),
  });

export const companySummaryResponseSchema = z.object({
  projects: z.array(companySummaryProjectResponseSchema),
});

export const companyExportJobResponseSchema = z.object({
  id: companyExportJobIdSchema,
  companyId: companyIdSchema,
  createdByUserId: userIdSchema,
  scope: z.enum(['all', 'active']),
  detail: z.enum(['full', 'summary']),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'expired']),
  fileName: z.string().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  downloadPath: z.string().optional(),
  errorMessage: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  requestedAt: isoTimestampSchema,
  startedAt: optionalIsoTimestampSchema,
  completedAt: optionalIsoTimestampSchema,
  failedAt: optionalIsoTimestampSchema,
  expiresAt: optionalIsoTimestampSchema,
  notifyWhenReady: z.boolean(),
  readyNotificationStatus: companyExportReadyNotificationStatusSchema,
  readyNotificationDelivery:
    companyExportReadyNotificationDeliverySchema.optional(),
  readyNotificationSentAt: optionalIsoTimestampSchema,
  readyNotificationError: z.string().optional(),
});

export const projectResponseSchema = z.object({
  id: projectIdSchema,
  companyId: companyIdSchema,
  name: z.string(),
  projectType: projectTypeSchema,
  parentProjectId: projectIdSchema.optional(),
  budgetTotalCents: projectBudgetTotalCentsSchema,
  currency: z.enum(['AUD', 'USD', 'EUR', 'GBP']),
  status: z.enum(['active', 'archived']),
  deactivatedAt: optionalIsoTimestampSchema,
  visibility: z.enum(['company', 'private']),
  allowSuperadminAccess: z.boolean(),
  allowTxnTransfers: z.boolean(),
});

export const projectsResponseSchema = z.array(projectResponseSchema);

const userResponseSchema = z.object({
  id: userIdSchema,
  email: z.email(),
  name: z.string(),
  disabled: z.boolean().optional(),
  isGlobalSuperadmin: z.boolean().optional(),
});

export const usersResponseSchema = z.array(userResponseSchema);

const companyMembershipResponseSchema = z.object({
  companyId: companyIdSchema,
  userId: userIdSchema,
  role: companyRoleSchema,
});

export const companyMembershipsResponseSchema = z.array(
  companyMembershipResponseSchema
);

const categoryResponseSchema = z.object({
  id: categoryIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  name: z.string(),
  originScope: projectStandardOriginScopeSchema.optional(),
  originCompanyItemId: z.string().optional(),
  syncStatus: projectStandardSyncStatusSchema.optional(),
  lastSyncedAt: optionalIsoTimestampSchema,
  sourceUpdatedAtSnapshot: optionalIsoTimestampSchema,
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const categoriesResponseSchema = z.array(categoryResponseSchema);

const subCategoryResponseSchema = z.object({
  id: subCategoryIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  categoryId: categoryIdSchema,
  name: z.string(),
  originScope: projectStandardOriginScopeSchema.optional(),
  originCompanyItemId: z.string().optional(),
  syncStatus: projectStandardSyncStatusSchema.optional(),
  lastSyncedAt: optionalIsoTimestampSchema,
  sourceUpdatedAtSnapshot: optionalIsoTimestampSchema,
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const subCategoriesResponseSchema = z.array(subCategoryResponseSchema);

const budgetLineResponseSchema = z.object({
  id: budgetLineIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  categoryId: categoryIdSchema.optional(),
  subCategoryId: subCategoryIdSchema.optional(),
  allocatedCents: budgetAllocatedCentsSchema,
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const budgetLinesResponseSchema = z.array(budgetLineResponseSchema);

const txnResponseSchema = z.object({
  id: txnIdSchema,
  internalId: z.string().optional(),
  externalId: z.string().optional(),
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  date: z.string(),
  item: z.string(),
  description: z.string(),
  amountCents: transactionAmountCentsSchema,
  txnType: z.enum(TXN_TYPES),
  parentTxnId: txnIdSchema.optional(),
  sourceTxnId: txnIdSchema.optional(),
  transferProjectId: projectIdSchema.optional(),
  budgetImpact: z.boolean(),
  categorisable: z.boolean(),
  importBatchId: importBatchIdSchema.optional(),
  importSourceType: z.enum(['powerbi_expenditure_actuals']).optional(),
  importSourceMeta: z.record(z.string(), z.string()).optional(),
  categoryId: categoryIdSchema.optional(),
  subCategoryId: subCategoryIdSchema.optional(),
  companyDefaultMappingRuleId: mappingRuleIdSchema.optional(),
  codingSource: codingSourceSchema.optional(),
  codingPendingApproval: z.boolean().optional(),
  reviewedAt: optionalIsoTimestampSchema,
  reviewedByUserId: userIdSchema.optional(),
  lockedAt: optionalIsoTimestampSchema,
  lockedByUserId: userIdSchema.optional(),
  reversal: z
    .object({
      id: z.string(),
      status: z.enum(TXN_REVERSAL_STATUSES),
      side: z.enum(TXN_REVERSAL_SIDES),
      counterpartTxnId: txnIdSchema.optional(),
      expectedProjectId: projectIdSchema.optional(),
      markedAt: optionalIsoTimestampSchema,
      markedByUserId: userIdSchema.optional(),
      matchedAt: optionalIsoTimestampSchema,
      matchedByUserId: userIdSchema.optional(),
      createdAt: optionalIsoTimestampSchema,
      updatedAt: optionalIsoTimestampSchema,
    })
    .optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const txnsResponseSchema = z.array(txnResponseSchema);

export const txnUpdateResultResponseSchema = z.object({
  txn: txnResponseSchema,
  projectRulePrompt: z.unknown().nullable(),
});

const txnListPageSummaryResponseSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  budgetImpactCents: z.number().int(),
  pendingReversalCount: z.number().int().nonnegative(),
  pendingReversalCents: z.number().int(),
  adjustedBudgetImpactCents: z.number().int(),
  uncodedCount: z.number().int().nonnegative(),
  uncodedCents: z.number().int(),
  sourceOnlyCount: z.number().int().nonnegative(),
  assignedToMeCount: z.number().int().nonnegative(),
  reviewedCount: z.number().int().nonnegative(),
  lockedCount: z.number().int().nonnegative(),
  invalidDateCount: z.number().int().nonnegative(),
});

export const txnListPageResultResponseSchema = z.object({
  rows: txnsResponseSchema,
  summary: txnListPageSummaryResponseSchema,
});

export const txnCommentResponseSchema = z.object({
  id: txnCommentIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  txnId: txnIdSchema,
  parentCommentId: txnCommentIdSchema.optional(),
  body: z.string(),
  assignedToUserId: userIdSchema.optional(),
  createdByUserId: userIdSchema,
  createdByName: z.string(),
  resolvedAt: optionalIsoTimestampSchema,
  resolvedByUserId: userIdSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const pendingEmailChangeResponseSchema = z
  .object({
    newEmail: z.email(),
    requestedAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema,
  })
  .nullable();

export const emailChangeRequestResponseSchema = z.object({
  newEmail: z.email(),
  expiresAt: isoTimestampSchema,
  delivery: z.enum(['email', 'log']),
});

export const emailChangeConfirmResponseSchema = z.object({
  email: z.email(),
  previousEmail: z.email(),
});

export const companyUserInviteResultResponseSchema = z.object({
  user: userResponseSchema,
  createdAuthUser: z.boolean(),
  membershipCreated: z.boolean(),
  onboardingEmailSent: z.boolean(),
  onboardingDelivery: z.enum(['email', 'log', 'none']),
});

const applyCompanyTaxonomyResultResponseSchema = z.object({
  companyDefaultsConfigured: z.boolean(),
  categoriesAdded: z.number().int().nonnegative(),
  subCategoriesAdded: z.number().int().nonnegative(),
});

export const applyCompanyStandardsResultResponseSchema =
  applyCompanyTaxonomyResultResponseSchema.extend({
    importRulesSynced: z.boolean(),
    autoCodingRulesSynced: z.boolean(),
  });

export const betterAuthSignUpResponseSchema = z.object({
  user: z.object({
    id: z.string().trim().min(1),
    email: z.email().optional(),
    name: z.string().optional(),
  }),
});
