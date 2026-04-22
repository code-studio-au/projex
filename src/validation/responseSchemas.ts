import { z } from 'zod';
import {
  asCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
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
const mappingRuleIdSchema = idSchema.transform(asCompanyDefaultMappingRuleId);
const optionalIsoTimestampSchema = z.string().optional();
const companyRoleSchema = z.enum(['superadmin', 'admin', 'executive', 'management', 'member']);
const projectRoleSchema = z.enum(['owner', 'lead', 'member', 'viewer']);

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

export const betterAuthLikePayloadSchema = z
  .object({
    userId: z.string().nullable().optional(),
    user: z
      .object({
        id: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .nullable();
