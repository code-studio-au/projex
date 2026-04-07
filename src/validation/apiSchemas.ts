import { z } from 'zod';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../types';

import {
  budgetAllocatedCentsSchema,
  categoryNameSchema,
  companyNameSchema,
  emailSchema,
  projectBudgetTotalCentsSchema,
  projectNameSchema,
  subCategoryNameSchema,
  txnInputSchema,
  userNameSchema,
} from './schemas';

const idSchema = z.string().trim().min(1, 'Id is required');
const companyIdSchema = idSchema.transform(asCompanyId);
const projectIdSchema = idSchema.transform(asProjectId);
const userIdSchema = idSchema.transform(asUserId);
const categoryIdSchema = idSchema.transform(asCategoryId);
const subCategoryIdSchema = idSchema.transform(asSubCategoryId);
const companyDefaultCategoryIdSchema = idSchema.transform(asCompanyDefaultCategoryId);
const companyDefaultSubCategoryIdSchema = idSchema.transform(asCompanyDefaultSubCategoryId);
const companyDefaultMappingRuleIdSchema = idSchema.transform(asCompanyDefaultMappingRuleId);
const txnIdSchema = idSchema.transform(asTxnId);
const budgetLineIdSchema = idSchema.transform(asBudgetLineId);
const optionalIsoTimestampSchema = z.string().optional();
const optionalCategoryIdSchema = categoryIdSchema.nullable().optional().transform((value) => value ?? undefined);
const optionalSubCategoryIdSchema = subCategoryIdSchema.nullable().optional().transform((value) => value ?? undefined);
const optionalMappingRuleIdSchema = companyDefaultMappingRuleIdSchema
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);
const nullableOptionalCategoryIdSchema = categoryIdSchema.nullable().optional();
const nullableOptionalSubCategoryIdSchema = subCategoryIdSchema.nullable().optional();

const companyRoleSchema = z.enum(['superadmin', 'admin', 'executive', 'management', 'member']);
const projectRoleSchema = z.enum(['owner', 'lead', 'member', 'viewer']);
const companyStatusSchema = z.enum(['active', 'deactivated']);
const projectStatusSchema = z.enum(['active', 'archived']);
const projectVisibilitySchema = z.enum(['company', 'private']);
const currencySchema = z.enum(['AUD', 'USD', 'EUR', 'GBP']);
const codingSourceSchema = z.enum(['manual', 'company_default_rule']);
const csvImportModeSchema = z.enum(['append', 'replaceAll']);
const smokeSectionIdSchema = z.enum([
  'basics',
  'appPages',
  'emailChange',
  'temporaryData',
  'companyDefaults',
  'inviteFlow',
  'privacyChecks',
]);
const matchTextSchema = z.string().trim().min(1, 'Match text is required').max(160);

export const smokeSectionInputSchema = z.object({
  sectionId: smokeSectionIdSchema,
});

export const emailChangeRequestBodySchema = z.object({
  newEmail: emailSchema,
});

export const emailChangeConfirmBodySchema = z.object({
  token: z.string().trim().min(1, 'Email change token is required.'),
});

export const profileUpdateBodySchema = z.object({
  name: userNameSchema,
});

export const createCompanyInputSchema = z.object({
  id: companyIdSchema.optional(),
  name: companyNameSchema,
});

export const updateCompanyBodySchema = z.object({
  name: companyNameSchema.optional(),
  status: companyStatusSchema.optional(),
  deactivatedAt: optionalIsoTimestampSchema,
});

export const createProjectInputSchema = z.object({
  id: projectIdSchema.optional(),
  name: projectNameSchema,
});

export const updateProjectBodySchema = z.object({
  name: projectNameSchema.optional(),
  budgetTotalCents: projectBudgetTotalCentsSchema.optional(),
  currency: currencySchema.optional(),
  status: projectStatusSchema.optional(),
  visibility: projectVisibilitySchema.optional(),
  allowSuperadminAccess: z.boolean().optional(),
  deactivatedAt: optionalIsoTimestampSchema,
});

export const upsertCompanyMembershipBodySchema = z.object({
  userId: userIdSchema,
  role: companyRoleSchema,
});

export const upsertProjectMembershipBodySchema = z.object({
  userId: userIdSchema,
  role: projectRoleSchema,
});

export const createCompanyUserBodySchema = z.object({
  name: userNameSchema,
  email: emailSchema,
  role: companyRoleSchema,
  sendOnboardingEmail: z.boolean().optional(),
});

export const createCategoryInputSchema = z.object({
  id: categoryIdSchema.optional(),
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  name: categoryNameSchema,
});

export const updateCategoryInputSchema = z.object({
  id: categoryIdSchema,
  companyId: companyIdSchema.optional(),
  projectId: projectIdSchema.optional(),
  name: categoryNameSchema.optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const createSubCategoryInputSchema = z.object({
  id: subCategoryIdSchema.optional(),
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  categoryId: categoryIdSchema,
  name: subCategoryNameSchema,
});

export const updateSubCategoryInputSchema = z.object({
  id: subCategoryIdSchema,
  companyId: companyIdSchema.optional(),
  projectId: projectIdSchema.optional(),
  categoryId: categoryIdSchema.optional(),
  name: subCategoryNameSchema.optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const createCompanyDefaultCategoryInputSchema = z.object({
  id: companyDefaultCategoryIdSchema.optional(),
  companyId: companyIdSchema,
  name: categoryNameSchema,
});

export const updateCompanyDefaultCategoryInputSchema = z.object({
  id: companyDefaultCategoryIdSchema,
  companyId: companyIdSchema.optional(),
  name: categoryNameSchema.optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const createCompanyDefaultSubCategoryInputSchema = z.object({
  id: companyDefaultSubCategoryIdSchema.optional(),
  companyId: companyIdSchema,
  companyDefaultCategoryId: companyDefaultCategoryIdSchema,
  name: subCategoryNameSchema,
});

export const updateCompanyDefaultSubCategoryInputSchema = z.object({
  id: companyDefaultSubCategoryIdSchema,
  companyId: companyIdSchema.optional(),
  companyDefaultCategoryId: companyDefaultCategoryIdSchema.optional(),
  name: subCategoryNameSchema.optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const createCompanyDefaultMappingRuleInputSchema = z.object({
  id: companyDefaultMappingRuleIdSchema.optional(),
  companyId: companyIdSchema,
  matchText: matchTextSchema,
  companyDefaultCategoryId: companyDefaultCategoryIdSchema,
  companyDefaultSubCategoryId: companyDefaultSubCategoryIdSchema,
  sortOrder: z.number().int().min(0),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const updateCompanyDefaultMappingRuleInputSchema = z.object({
  id: companyDefaultMappingRuleIdSchema,
  matchText: matchTextSchema.optional(),
  companyDefaultCategoryId: companyDefaultCategoryIdSchema.optional(),
  companyDefaultSubCategoryId: companyDefaultSubCategoryIdSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const createBudgetInputSchema = z.object({
  id: budgetLineIdSchema.optional(),
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  categoryId: optionalCategoryIdSchema,
  subCategoryId: optionalSubCategoryIdSchema,
  allocatedCents: budgetAllocatedCentsSchema,
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const updateBudgetInputSchema = z.object({
  id: budgetLineIdSchema,
  companyId: companyIdSchema.optional(),
  projectId: projectIdSchema.optional(),
  categoryId: optionalCategoryIdSchema,
  subCategoryId: optionalSubCategoryIdSchema,
  allocatedCents: budgetAllocatedCentsSchema.optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const createTxnInputSchema = z.object({
  id: txnIdSchema.optional(),
  externalId: z.string().optional(),
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  date: txnInputSchema.shape.date,
  item: txnInputSchema.shape.item,
  description: txnInputSchema.shape.description,
  amountCents: txnInputSchema.shape.amountCents,
  categoryId: optionalCategoryIdSchema,
  subCategoryId: optionalSubCategoryIdSchema,
  companyDefaultMappingRuleId: optionalMappingRuleIdSchema,
  codingSource: codingSourceSchema.optional(),
  codingPendingApproval: z.boolean().optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const updateTxnInputSchema = z.object({
  id: txnIdSchema,
  companyId: companyIdSchema.optional(),
  projectId: projectIdSchema.optional(),
  date: txnInputSchema.shape.date.optional(),
  item: txnInputSchema.shape.item.optional(),
  description: txnInputSchema.shape.description.optional(),
  amountCents: txnInputSchema.shape.amountCents.optional(),
  externalId: z.string().nullable().optional(),
  categoryId: nullableOptionalCategoryIdSchema,
  subCategoryId: nullableOptionalSubCategoryIdSchema,
  companyDefaultMappingRuleId: optionalMappingRuleIdSchema,
  codingSource: codingSourceSchema.optional(),
  codingPendingApproval: z.boolean().optional(),
  createdAt: optionalIsoTimestampSchema,
  updatedAt: optionalIsoTimestampSchema,
});

export const txnMutationBodySchema = z.object({
  txn: createTxnInputSchema,
});

export const txnUpdateMutationBodySchema = z.object({
  txn: updateTxnInputSchema,
});

const importedTxnInputSchema = createTxnInputSchema.extend({
  id: txnIdSchema,
});

export const txnImportInputSchema = z.object({
  txns: z.array(importedTxnInputSchema),
  mode: csvImportModeSchema,
  autoCreateBudgets: z.boolean().optional(),
});

export const txnImportPreviewInputSchema = z.object({
  csvText: z.string(),
  autoCreateStructures: z.boolean().optional(),
});

export const devSessionBodySchema = z.object({
  userId: userIdSchema,
});
