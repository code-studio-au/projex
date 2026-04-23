import { z } from 'zod';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyId,
  asCompanyDefaultSubCategoryId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../types';

export const apiMessageResponseSchema = z.object({
  message: z.string().optional(),
});

const idSchema = z.string().trim().min(1, 'Id is required');
const companyIdSchema = idSchema.transform(asCompanyId);
const projectIdSchema = idSchema.transform(asProjectId);
const userIdSchema = idSchema.transform(asUserId);
const categoryIdSchema = idSchema.transform(asCategoryId);
const subCategoryIdSchema = idSchema.transform(asSubCategoryId);
const budgetLineIdSchema = idSchema.transform(asBudgetLineId);
const companyDefaultCategoryIdSchema = idSchema.transform(asCompanyDefaultCategoryId);
const companyDefaultSubCategoryIdSchema = idSchema.transform(asCompanyDefaultSubCategoryId);
const mappingRuleIdSchema = idSchema.transform(asCompanyDefaultMappingRuleId);
const txnIdSchema = idSchema.transform(asTxnId);
const optionalIsoTimestampSchema = z.string().optional();
const companyRoleSchema = z.enum(['superadmin', 'admin', 'executive', 'management', 'member']);
const projectRoleSchema = z.enum(['owner', 'lead', 'member', 'viewer']);
const codingSourceSchema = z.enum(['manual', 'company_default_rule']);

export const authenticatedSessionResponseSchema = z.object({
  userId: userIdSchema,
});

export const sessionResponseSchema = authenticatedSessionResponseSchema.nullable();

export const companyResponseSchema = z.object({
  id: companyIdSchema,
  name: z.string(),
  status: z.enum(['active', 'deactivated']),
  deactivatedAt: optionalIsoTimestampSchema,
});

export const companiesResponseSchema = z.array(companyResponseSchema);

export const companySummaryMonthResponseSchema = z.object({
  monthKey: z.string(),
  actualCodedCents: z.number(),
  uncodedCount: z.number().int().nonnegative(),
  uncodedAmountCents: z.number(),
});

export const companySummaryProjectResponseSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  status: z.enum(['active', 'archived']),
  visibility: z.enum(['company', 'private']),
  currency: z.enum(['AUD', 'USD', 'EUR', 'GBP']),
  budgetCents: z.number(),
  months: z.array(companySummaryMonthResponseSchema),
});

export const companySummaryResponseSchema = z.object({
  projects: z.array(companySummaryProjectResponseSchema),
});

export const projectResponseSchema = z.object({
  id: projectIdSchema,
  companyId: companyIdSchema,
  name: z.string(),
  budgetTotalCents: z.number(),
  currency: z.enum(['AUD', 'USD', 'EUR', 'GBP']),
  status: z.enum(['active', 'archived']),
  deactivatedAt: optionalIsoTimestampSchema,
  visibility: z.enum(['company', 'private']),
  allowSuperadminAccess: z.boolean(),
});

export const projectsResponseSchema = z.array(projectResponseSchema);

export const userResponseSchema = z.object({
  id: userIdSchema,
  email: z.string().email(),
  name: z.string(),
  disabled: z.boolean().optional(),
});

export const usersResponseSchema = z.array(userResponseSchema);

export const companyMembershipResponseSchema = z.object({
  companyId: companyIdSchema,
  userId: userIdSchema,
  role: companyRoleSchema,
});

export const companyMembershipsResponseSchema = z.array(companyMembershipResponseSchema);

export const projectMembershipResponseSchema = z.object({
  projectId: projectIdSchema,
  userId: userIdSchema,
  role: projectRoleSchema,
});

export const projectMembershipsResponseSchema = z.array(projectMembershipResponseSchema);

export const companyDefaultCategoryResponseSchema = z.object({
  id: companyDefaultCategoryIdSchema,
  companyId: companyIdSchema,
  name: z.string(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const companyDefaultCategoriesResponseSchema = z.array(companyDefaultCategoryResponseSchema);

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
  allocatedCents: z.number(),
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
  amountCents: z.number(),
  categoryId: categoryIdSchema.optional(),
  subCategoryId: subCategoryIdSchema.optional(),
  companyDefaultMappingRuleId: mappingRuleIdSchema.optional(),
  codingSource: codingSourceSchema.optional(),
  codingPendingApproval: z.boolean().optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const txnsResponseSchema = z.array(txnResponseSchema);

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
  mappingStatus: z.enum(['matched_rule', 'csv_taxonomy', 'auto_created', 'uncoded', 'invalid']),
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
  warnings: z.array(z.string()),
});

export const txnImportPreviewResultResponseSchema = z.object({
  rows: z.array(importPreviewRowResponseSchema),
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
