import { z } from 'zod';
import type {
  CompanySummaryProject,
  CompanyWorkQueue,
} from '../types/index.ts';
import {
  budgetAllocatedCentsSchema,
  projectBudgetTotalCentsSchema,
  transactionAmountCentsSchema,
} from './schemas.ts';
import {
  budgetLineIdResponseSchema,
  categoryIdResponseSchema,
  companyExportJobIdResponseSchema,
  companyIdResponseSchema,
  companyRoleResponseSchema,
  isoTimestampResponseSchema,
  optionalIsoTimestampResponseSchema,
  projectIdResponseSchema,
  projectStandardOriginScopeResponseSchema,
  projectStandardSyncStatusResponseSchema,
  projectTypeResponseSchema,
  subCategoryIdResponseSchema,
  userIdResponseSchema,
} from './responseSchemaPrimitives.ts';
import { omitUndefinedProperties } from '../utils/optionalProperties.ts';

export * from './accountResponseSchemas.ts';
export * from './apiResponseSchemas.ts';
export * from './authResponseSchemas.ts';
export * from './transactionResponseSchemas.ts';

export const authenticatedSessionResponseSchema = z.object({
  userId: userIdResponseSchema,
});

const companyResponseSchema = z.object({
  id: companyIdResponseSchema,
  name: z.string(),
  status: z.enum(['active', 'deactivated']),
  deactivatedAt: optionalIsoTimestampResponseSchema,
});

export const companiesResponseSchema = z.array(companyResponseSchema);

const companySummaryMonthResponseSchema = z.object({
  monthKey: z.string(),
  actualCodedCents: transactionAmountCentsSchema,
  pendingReversalCount: z.number().int().nonnegative(),
  pendingReversalCents: transactionAmountCentsSchema,
  adjustedActualCodedCents: transactionAmountCentsSchema,
  uncodedCount: z.number().int().nonnegative(),
  uncodedAmountCents: transactionAmountCentsSchema,
});

export const companySummaryProjectResponseSchema: z.ZodType<CompanySummaryProject> =
  z
    .object({
      id: projectIdResponseSchema,
      name: z.string(),
      projectType: projectTypeResponseSchema,
      parentProjectId: projectIdResponseSchema.optional(),
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
    })
    .transform(omitUndefinedProperties);

export const companySummaryResponseSchema = z.object({
  projects: z.array(companySummaryProjectResponseSchema),
});

export const companyWorkQueueResponseSchema: z.ZodType<CompanyWorkQueue> =
  z.object({
    projects: z.array(
      z
        .object({
          projectId: projectIdResponseSchema,
          projectName: z.string(),
          needsCodingCount: z.number().int().nonnegative(),
          oldestNeedsCodingDate: z.string().optional(),
          codingApprovalCount: z.number().int().nonnegative(),
          oldestCodingApprovalDate: z.string().optional(),
          reversalReviewCount: z.number().int().nonnegative(),
          oldestReversalReviewDate: z.string().optional(),
          unlockRequestCount: z.number().int().nonnegative(),
          oldestUnlockRequestAt: optionalIsoTimestampResponseSchema,
        })
        .transform(omitUndefinedProperties)
    ),
    ruleSuggestionCount: z.number().int().nonnegative(),
  });

const companyExportReadyNotificationStatusResponseSchema = z.enum([
  'not_requested',
  'pending',
  'sent',
  'failed',
]);
const companyExportReadyNotificationDeliveryResponseSchema = z.enum([
  'email',
  'log',
]);

export const companyExportJobResponseSchema = z.object({
  id: companyExportJobIdResponseSchema,
  companyId: companyIdResponseSchema,
  createdByUserId: userIdResponseSchema,
  scope: z.enum(['all', 'active']),
  detail: z.enum(['full', 'summary']),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'expired']),
  fileName: z.string().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  downloadPath: z.string().optional(),
  errorMessage: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  requestedAt: isoTimestampResponseSchema,
  startedAt: optionalIsoTimestampResponseSchema,
  completedAt: optionalIsoTimestampResponseSchema,
  failedAt: optionalIsoTimestampResponseSchema,
  expiresAt: optionalIsoTimestampResponseSchema,
  notifyWhenReady: z.boolean(),
  readyNotificationStatus: companyExportReadyNotificationStatusResponseSchema,
  readyNotificationDelivery:
    companyExportReadyNotificationDeliveryResponseSchema.optional(),
  readyNotificationSentAt: optionalIsoTimestampResponseSchema,
  readyNotificationError: z.string().optional(),
});

export const projectResponseSchema = z.object({
  id: projectIdResponseSchema,
  companyId: companyIdResponseSchema,
  name: z.string(),
  projectType: projectTypeResponseSchema,
  parentProjectId: projectIdResponseSchema.optional(),
  budgetTotalCents: projectBudgetTotalCentsSchema,
  currency: z.enum(['AUD', 'USD', 'EUR', 'GBP']),
  status: z.enum(['active', 'archived']),
  deactivatedAt: optionalIsoTimestampResponseSchema,
  visibility: z.enum(['company', 'private']),
  allowSuperadminAccess: z.boolean(),
  allowTxnTransfers: z.boolean(),
});

export const projectsResponseSchema = z.array(projectResponseSchema);

const userResponseSchema = z.object({
  id: userIdResponseSchema,
  email: z.email(),
  name: z.string(),
  disabled: z.boolean().optional(),
  isGlobalSuperadmin: z.boolean().optional(),
});

export const usersResponseSchema = z.array(userResponseSchema);

const companyMembershipResponseSchema = z.object({
  companyId: companyIdResponseSchema,
  userId: userIdResponseSchema,
  role: companyRoleResponseSchema,
});

export const companyMembershipsResponseSchema = z.array(
  companyMembershipResponseSchema
);

const categoryResponseSchema = z.object({
  id: categoryIdResponseSchema,
  companyId: companyIdResponseSchema,
  projectId: projectIdResponseSchema,
  name: z.string(),
  originScope: projectStandardOriginScopeResponseSchema.optional(),
  originCompanyItemId: z.string().optional(),
  syncStatus: projectStandardSyncStatusResponseSchema.optional(),
  lastSyncedAt: optionalIsoTimestampResponseSchema,
  sourceUpdatedAtSnapshot: optionalIsoTimestampResponseSchema,
  createdAt: optionalIsoTimestampResponseSchema,
  updatedAt: optionalIsoTimestampResponseSchema,
});

export const categoriesResponseSchema = z.array(categoryResponseSchema);

const subCategoryResponseSchema = z.object({
  id: subCategoryIdResponseSchema,
  companyId: companyIdResponseSchema,
  projectId: projectIdResponseSchema,
  categoryId: categoryIdResponseSchema,
  name: z.string(),
  originScope: projectStandardOriginScopeResponseSchema.optional(),
  originCompanyItemId: z.string().optional(),
  syncStatus: projectStandardSyncStatusResponseSchema.optional(),
  lastSyncedAt: optionalIsoTimestampResponseSchema,
  sourceUpdatedAtSnapshot: optionalIsoTimestampResponseSchema,
  createdAt: optionalIsoTimestampResponseSchema,
  updatedAt: optionalIsoTimestampResponseSchema,
});

export const subCategoriesResponseSchema = z.array(subCategoryResponseSchema);

const budgetLineResponseSchema = z.object({
  id: budgetLineIdResponseSchema,
  companyId: companyIdResponseSchema,
  projectId: projectIdResponseSchema,
  categoryId: categoryIdResponseSchema.optional(),
  subCategoryId: subCategoryIdResponseSchema.optional(),
  allocatedCents: budgetAllocatedCentsSchema,
  createdAt: optionalIsoTimestampResponseSchema,
  updatedAt: optionalIsoTimestampResponseSchema,
});

export const budgetLinesResponseSchema = z.array(budgetLineResponseSchema);

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
