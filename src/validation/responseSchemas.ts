import { z } from 'zod';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyId,
  asCompanyDefaultSubCategoryId,
  asImportBatchId,
  asImportCandidateId,
  asImportRuleId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
  TXN_TYPES,
} from '../types/index.ts';
import type { CompanySummaryProject } from '../types/index.ts';
import {
  budgetAllocatedCentsSchema,
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

const idSchema = z.string().trim().min(1, 'Id is required');
const companyIdSchema = idSchema.transform(asCompanyId);
const projectIdSchema = idSchema.transform(asProjectId);
const userIdSchema = idSchema.transform(asUserId);
const categoryIdSchema = idSchema.transform(asCategoryId);
const subCategoryIdSchema = idSchema.transform(asSubCategoryId);
const budgetLineIdSchema = idSchema.transform(asBudgetLineId);
const companyDefaultCategoryIdSchema = idSchema.transform(
  asCompanyDefaultCategoryId
);
const companyDefaultSubCategoryIdSchema = idSchema.transform(
  asCompanyDefaultSubCategoryId
);
const mappingRuleIdSchema = idSchema.transform(asCompanyDefaultMappingRuleId);
const importBatchIdSchema = idSchema.transform(asImportBatchId);
const importCandidateIdSchema = idSchema.transform(asImportCandidateId);
const importRuleIdSchema = idSchema.transform(asImportRuleId);
const txnIdSchema = idSchema.transform(asTxnId);
const txnCommentIdSchema = idSchema.transform(asTxnCommentId);
const optionalIsoTimestampSchema = z.string().optional();
const companyRoleSchema = z.enum([
  'admin',
  'executive',
  'management',
  'member',
]);
const projectRoleSchema = z.enum(['owner', 'lead', 'member', 'viewer']);
const projectTypeSchema = z.enum(['project', 'programme']);
const codingSourceSchema = z.enum(['manual', 'company_default_rule']);
const txnListViewSchema = z.enum([
  'all',
  'uncoded',
  'auto-mapped-pending',
  'assigned-to-me',
]);
const txnListSortFieldSchema = z.enum(['date', 'transaction', 'amountCents']);
const txnListSortDirectionSchema = z.enum(['asc', 'desc']);

export const authenticatedSessionResponseSchema = z.object({
  userId: userIdSchema,
});

export const sessionResponseSchema =
  authenticatedSessionResponseSchema.nullable();

export const companyResponseSchema = z.object({
  id: companyIdSchema,
  name: z.string(),
  status: z.enum(['active', 'deactivated']),
  deactivatedAt: optionalIsoTimestampSchema,
});

export const companiesResponseSchema = z.array(companyResponseSchema);

export const companySummaryMonthResponseSchema = z.object({
  monthKey: z.string(),
  actualCodedCents: transactionAmountCentsSchema,
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

export const userResponseSchema = z.object({
  id: userIdSchema,
  email: z.string().email(),
  name: z.string(),
  disabled: z.boolean().optional(),
  isGlobalSuperadmin: z.boolean().optional(),
});

export const usersResponseSchema = z.array(userResponseSchema);

export const companyMembershipResponseSchema = z.object({
  companyId: companyIdSchema,
  userId: userIdSchema,
  role: companyRoleSchema,
});

export const companyMembershipsResponseSchema = z.array(
  companyMembershipResponseSchema
);

export const projectMembershipResponseSchema = z.object({
  projectId: projectIdSchema,
  userId: userIdSchema,
  role: projectRoleSchema,
});

export const projectMembershipsResponseSchema = z.array(
  projectMembershipResponseSchema
);

export const companyDefaultCategoryResponseSchema = z.object({
  id: companyDefaultCategoryIdSchema,
  companyId: companyIdSchema,
  name: z.string(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const companyDefaultCategoriesResponseSchema = z.array(
  companyDefaultCategoryResponseSchema
);

export const companyDefaultSubCategoryResponseSchema = z.object({
  id: companyDefaultSubCategoryIdSchema,
  companyId: companyIdSchema,
  companyDefaultCategoryId: companyDefaultCategoryIdSchema,
  name: z.string(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const companyDefaultSubCategoriesResponseSchema = z.array(
  companyDefaultSubCategoryResponseSchema
);

export const companyDefaultMappingRuleResponseSchema = z.object({
  id: mappingRuleIdSchema,
  companyId: companyIdSchema,
  matchText: z.string(),
  companyDefaultCategoryId: companyDefaultCategoryIdSchema,
  companyDefaultSubCategoryId: companyDefaultSubCategoryIdSchema,
  sortOrder: z.number().int(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const companyDefaultMappingRulesResponseSchema = z.array(
  companyDefaultMappingRuleResponseSchema
);

export const companyDefaultsResponseSchema = z.object({
  categories: companyDefaultCategoriesResponseSchema,
  subCategories: companyDefaultSubCategoriesResponseSchema,
  mappingRules: companyDefaultMappingRulesResponseSchema,
});

export const importRuleResponseSchema = z.object({
  id: importRuleIdSchema,
  companyId: companyIdSchema,
  name: z.string(),
  action: z.enum(['import', 'exclude', 'review']),
  field: z.enum([
    'ledger',
    'source',
    'journalId',
    'journalLineDescription',
    'ccAndDescription',
    'vendorName',
    'poId',
    'referenceNum',
    'anyText',
  ]),
  operator: z.enum(['equals', 'contains', 'starts_with', 'regex']),
  value: z.string(),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const importRulesResponseSchema = z.array(importRuleResponseSchema);

export const categoryResponseSchema = z.object({
  id: categoryIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  name: z.string(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const categoriesResponseSchema = z.array(categoryResponseSchema);

export const subCategoryResponseSchema = z.object({
  id: subCategoryIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  categoryId: categoryIdSchema,
  name: z.string(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const subCategoriesResponseSchema = z.array(subCategoryResponseSchema);

export const budgetLineResponseSchema = z.object({
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

export const txnResponseSchema = z.object({
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
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const txnsResponseSchema = z.array(txnResponseSchema);

export const txnListPageSummaryResponseSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  budgetImpactCents: z.number().int(),
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

export const txnListPageInputResponseSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  sort: z
    .object({
      field: txnListSortFieldSchema,
      direction: txnListSortDirectionSchema,
    })
    .optional(),
  yearFilter: z.string().optional(),
  quarterFilter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  monthFilterKey: z.string().optional(),
  transactionView: txnListViewSchema.optional(),
  drilldown: z
    .union([
      z.object({
        kind: z.literal('category'),
        categoryId: categoryIdSchema,
      }),
      z.object({
        kind: z.literal('subcategory'),
        categoryId: categoryIdSchema,
        subCategoryId: subCategoryIdSchema,
      }),
    ])
    .optional(),
});

export const txnSplitResponseSchema = z.object({
  parent: txnResponseSchema,
  children: txnsResponseSchema,
});

export const txnTransferResponseSchema = z.object({
  source: txnResponseSchema,
  destination: txnResponseSchema,
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const txnCommentsResponseSchema = z.array(txnCommentResponseSchema);

export const txnCommentSummaryResponseSchema = z.object({
  txnId: txnIdSchema,
  totalCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  assignedToMeUnresolvedCount: z.number().int().nonnegative(),
  latestCommentBody: z.string().optional(),
  latestCommentCreatedAt: optionalIsoTimestampSchema,
  latestCommentAuthorName: z.string().optional(),
});

export const txnCommentSummariesResponseSchema = z.array(
  txnCommentSummaryResponseSchema
);

export const pendingEmailChangeResponseSchema = z
  .object({
    newEmail: z.string().email(),
    requestedAt: z.string(),
    expiresAt: z.string(),
  })
  .nullable();

export const emailChangeRequestResponseSchema = z.object({
  newEmail: z.string().email(),
  expiresAt: z.string(),
  delivery: z.enum(['email', 'log']),
});

export const emailChangeConfirmResponseSchema = z.object({
  email: z.string().email(),
  previousEmail: z.string().email(),
});

export const countResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const okResponseSchema = z.object({
  ok: z.literal(true),
});

export const defaultCompanyResponseSchema = z.object({
  companyId: companyIdSchema.nullable(),
});

export const companyUserInviteResultResponseSchema = z.object({
  user: userResponseSchema,
  createdAuthUser: z.boolean(),
  membershipCreated: z.boolean(),
  onboardingEmailSent: z.boolean(),
  onboardingDelivery: z.enum(['email', 'log', 'none']),
});

export const importPreviewRowResponseSchema = z.object({
  sourceRowIndex: z.number().int().nonnegative(),
  importId: z.string(),
  externalId: z.string().optional(),
  parsedDate: z.string().nullable(),
  amountCents: z.number().nullable(),
  item: z.string().nullable(),
  description: z.string().nullable(),
  duplicate: z.boolean(),
  duplicateReason: z.enum(['existing', 'import']).optional(),
  importAction: z.enum(['import', 'exclude', 'review']),
  importRuleId: importRuleIdSchema.optional(),
  importRuleName: z.string().optional(),
  importDecisionReason: z.string().optional(),
  mappingStatus: z.enum([
    'matched_rule',
    'source_taxonomy',
    'auto_created',
    'uncoded',
    'invalid',
  ]),
  categoryId: categoryIdSchema.optional(),
  subCategoryId: subCategoryIdSchema.optional(),
  categoryName: z.string().optional(),
  subCategoryName: z.string().optional(),
  ruleId: mappingRuleIdSchema.optional(),
  codingSource: z.enum(['manual', 'company_default_rule']).optional(),
  codingPendingApproval: z.boolean(),
  willCreateCategory: z.boolean(),
  willCreateSubCategory: z.boolean(),
  willCreateBudgetLine: z.boolean(),
  sourceType: z.enum(['powerbi_expenditure_actuals']).optional(),
  rawSourceRow: z.record(z.string(), z.string()).optional(),
  warnings: z.array(z.string()),
});

export const txnImportPreviewResultResponseSchema = z.object({
  importBatchId: importBatchIdSchema.optional(),
  rows: z.array(importPreviewRowResponseSchema),
});

export const importCandidateResponseSchema = z.object({
  id: importCandidateIdSchema,
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  batchId: importBatchIdSchema,
  sourceRowIndex: z.number().int().nonnegative(),
  rawRow: z.record(z.string(), z.string()),
  status: z.enum([
    'ready',
    'excluded',
    'needs_project_review',
    'approved',
    'rejected',
    'imported',
    'invalid',
    'duplicate',
  ]),
  matchedImportRuleId: importRuleIdSchema.optional(),
  statusReason: z.string().optional(),
  txnId: txnIdSchema.optional(),
  reviewedByUserId: userIdSchema.optional(),
  reviewedAt: optionalIsoTimestampSchema,
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const importCandidatesResponseSchema = z.array(
  importCandidateResponseSchema
);

export const importCandidateReviewResultResponseSchema = z.object({
  candidate: importCandidateResponseSchema,
  txn: txnResponseSchema.optional(),
});

export const applyCompanyDefaultsResultResponseSchema = z.object({
  companyDefaultsConfigured: z.boolean(),
  categoriesAdded: z.number().int().nonnegative(),
  subCategoriesAdded: z.number().int().nonnegative(),
});

export const betterAuthLikePayloadSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .optional(),
    message: z.string().optional(),
    userId: z.string().nullable().optional(),
    user: z
      .object({
        id: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .nullable();

export const authClientErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export type AuthClientError = z.infer<typeof authClientErrorSchema>;

export const authClientErrorResponseSchema = z
  .object({
    error: authClientErrorSchema.optional(),
    message: z.string().optional(),
  })
  .passthrough()
  .nullable();

export const authClientSignInResponseSchema = z
  .record(z.string(), z.unknown())
  .nullable();

export const authClientSignOutResponseSchema = z
  .record(z.string(), z.unknown())
  .nullable();

export const betterAuthSignUpResponseSchema = z.object({
  user: z.object({
    id: z.string().trim().min(1),
    email: z.string().email().optional(),
    name: z.string().optional(),
  }),
});
