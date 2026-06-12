import { z } from 'zod';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asImportBatchId,
  asImportCandidateId,
  asImportRuleId,
  asCompanyExportJobId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../types/index.ts';

import {
  budgetAllocatedCentsSchema,
  categoryNameSchema,
  companyNameSchema,
  emailSchema,
  projectBudgetTotalCentsSchema,
  projectNameSchema,
  subCategoryNameSchema,
  txnCommentBodySchema,
  txnInputSchema,
  userNameSchema,
} from './schemas.ts';
import {
  MAX_IMPORT_PREVIEW_CSV_TEXT_LENGTH,
  MAX_IMPORT_TXN_COUNT,
} from '../utils/importLimits.ts';

const idSchema = z.string().trim().min(1, 'Id is required');
const companyIdSchema = idSchema.transform(asCompanyId);
const projectIdSchema = idSchema.transform(asProjectId);
const userIdSchema = idSchema.transform(asUserId);
const categoryIdSchema = idSchema.transform(asCategoryId);
const subCategoryIdSchema = idSchema.transform(asSubCategoryId);
const companyDefaultCategoryIdSchema = idSchema.transform(
  asCompanyDefaultCategoryId
);
const companyDefaultSubCategoryIdSchema = idSchema.transform(
  asCompanyDefaultSubCategoryId
);
const companyDefaultMappingRuleIdSchema = idSchema.transform(
  asCompanyDefaultMappingRuleId
);
const importRuleIdSchema = idSchema.transform(asImportRuleId);
export const importBatchIdParamSchema = idSchema.transform(asImportBatchId);
const importCandidateIdSchema = idSchema.transform(asImportCandidateId);
export const companyExportJobIdParamSchema = idSchema.transform(asCompanyExportJobId);
const txnIdSchema = idSchema.transform(asTxnId);
const txnCommentIdSchema = idSchema.transform(asTxnCommentId);
const budgetLineIdSchema = idSchema.transform(asBudgetLineId);
const optionalCategoryIdSchema = categoryIdSchema
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);
const optionalSubCategoryIdSchema = subCategoryIdSchema
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);
const optionalMappingRuleIdSchema = companyDefaultMappingRuleIdSchema
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);
const nullableOptionalCategoryIdSchema = categoryIdSchema.nullable().optional();
const nullableOptionalSubCategoryIdSchema = subCategoryIdSchema
  .nullable()
  .optional();
const nullableOptionalMappingRuleIdSchema = companyDefaultMappingRuleIdSchema
  .nullable()
  .optional();

const companyRoleSchema = z.enum([
  'admin',
  'executive',
  'management',
  'member',
]);
const projectRoleSchema = z.enum(['owner', 'lead', 'member', 'viewer']);
const projectVisibilitySchema = z.enum(['company', 'private']);
const projectTypeSchema = z.enum(['project', 'programme']);
const currencySchema = z.enum(['AUD', 'USD', 'EUR', 'GBP']);
const codingSourceSchema = z.enum(['manual', 'company_default_rule']);
const importSourceTypeSchema = z.enum(['powerbi_expenditure_actuals']);
const importRuleActionSchema = z.enum(['import', 'exclude', 'review']);
const importRuleFieldSchema = z.enum([
  'ledger',
  'source',
  'journalId',
  'journalLineDescription',
  'ccAndDescription',
  'vendorName',
  'poId',
  'referenceNum',
  'anyText',
]);
const importRuleOperatorSchema = z.enum([
  'equals',
  'equals_any',
  'contains',
  'contains_any',
  'starts_with',
  'starts_with_any',
  'ends_with',
  'ends_with_any',
]);
const destructiveConfirmationSchema = z
  .string()
  .trim()
  .min(1, 'Confirmation text is required');
const dateOnlyStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const csvImportModeSchema = z.enum(['append', 'replaceAll']);
const importPreviewSourceTypeSchema = z.enum(['powerbi_expenditure_actuals']);
const txnListViewSchema = z.enum([
  'all',
  'uncoded',
  'auto-mapped-pending',
  'assigned-to-me',
]);
const txnListSortFieldSchema = z.enum(['date', 'transaction', 'amountCents']);
const txnListSortDirectionSchema = z.enum(['asc', 'desc']);
const smokeSectionIdSchema = z.enum([
  'basics',
  'appPages',
  'emailChange',
  'temporaryData',
  'companyDefaults',
  'inviteFlow',
  'privacyChecks',
]);
const matchTextSchema = z
  .string()
  .trim()
  .min(1, 'Match text is required')
  .max(160);
const importRuleNameSchema = z
  .string()
  .trim()
  .min(1, 'Import Rule name is required')
  .max(160);
const importRuleValueSchema = z
  .string()
  .trim()
  .min(1, 'Import Rule value is required')
  .max(500);

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
  initialAdminName: userNameSchema.optional(),
  initialAdminEmail: emailSchema.optional(),
});

export const updateCompanyBodySchema = z.object({
  name: companyNameSchema.optional(),
});

export const createProjectInputSchema = z.object({
  id: projectIdSchema.optional(),
  name: projectNameSchema,
  projectType: projectTypeSchema.optional(),
  parentProjectId: projectIdSchema.nullable().optional(),
  currency: currencySchema.optional(),
  initialOwnerUserId: userIdSchema.optional(),
});

export const updateProjectBodySchema = z.object({
  name: projectNameSchema.optional(),
  projectType: projectTypeSchema.optional(),
  parentProjectId: projectIdSchema.nullable().optional(),
  budgetTotalCents: projectBudgetTotalCentsSchema.optional(),
  currency: currencySchema.optional(),
  visibility: projectVisibilitySchema.optional(),
  allowSuperadminAccess: z.boolean().optional(),
  allowTxnTransfers: z.boolean().optional(),
});

export const deleteCompanyBodySchema = z.object({
  confirmation: destructiveConfirmationSchema,
});

export const companyExportQuerySchema = z
  .object({
    scope: z.enum(['all', 'active']).optional(),
    detail: z.enum(['full', 'summary']).optional(),
    from: dateOnlyStringSchema.optional(),
    to: dateOnlyStringSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`from` date must be on or before `to` date',
        path: ['from'],
      });
    }
  });

export const createCompanyExportJobBodySchema = companyExportQuerySchema;


export const deleteProjectBodySchema = z.object({
  confirmation: destructiveConfirmationSchema,
});

export const upsertCompanyMembershipBodySchema = z.object({
  userId: userIdSchema,
  role: companyRoleSchema,
});

export const deleteCompanyMembershipQuerySchema = z.object({
  userId: userIdSchema,
});

export const upsertProjectMembershipBodySchema = z.object({
  userId: userIdSchema,
  role: projectRoleSchema,
});

export const deleteProjectMembershipQuerySchema = z.object({
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
});

export const createCompanyDefaultMappingRuleInputSchema = z.object({
  id: companyDefaultMappingRuleIdSchema.optional(),
  companyId: companyIdSchema,
  matchText: matchTextSchema,
  companyDefaultCategoryId: companyDefaultCategoryIdSchema,
  companyDefaultSubCategoryId: companyDefaultSubCategoryIdSchema,
  sortOrder: z.number().int().min(0),
});

export const updateCompanyDefaultMappingRuleInputSchema = z.object({
  id: companyDefaultMappingRuleIdSchema,
  matchText: matchTextSchema.optional(),
  companyDefaultCategoryId: companyDefaultCategoryIdSchema.optional(),
  companyDefaultSubCategoryId: companyDefaultSubCategoryIdSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createImportRuleInputSchema = z.object({
  id: importRuleIdSchema.optional(),
  companyId: companyIdSchema,
  name: importRuleNameSchema,
  action: importRuleActionSchema,
  field: importRuleFieldSchema,
  operator: importRuleOperatorSchema,
  value: importRuleValueSchema,
  sortOrder: z.number().int().min(0),
  enabled: z.boolean(),
});

export const updateImportRuleInputSchema = z.object({
  id: importRuleIdSchema,
  name: importRuleNameSchema.optional(),
  action: importRuleActionSchema.optional(),
  field: importRuleFieldSchema.optional(),
  operator: importRuleOperatorSchema.optional(),
  value: importRuleValueSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const createBudgetInputSchema = z.object({
  id: budgetLineIdSchema.optional(),
  companyId: companyIdSchema,
  projectId: projectIdSchema,
  categoryId: optionalCategoryIdSchema,
  subCategoryId: optionalSubCategoryIdSchema,
  allocatedCents: budgetAllocatedCentsSchema,
});

export const updateBudgetInputSchema = z.object({
  id: budgetLineIdSchema,
  companyId: companyIdSchema.optional(),
  projectId: projectIdSchema.optional(),
  categoryId: optionalCategoryIdSchema,
  subCategoryId: optionalSubCategoryIdSchema,
  allocatedCents: budgetAllocatedCentsSchema.optional(),
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
  importSourceType: importSourceTypeSchema.optional(),
  importSourceMeta: z.record(z.string(), z.string()).optional(),
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
  companyDefaultMappingRuleId: nullableOptionalMappingRuleIdSchema,
  codingSource: codingSourceSchema.optional(),
  codingPendingApproval: z.boolean().optional(),
});

export const txnMutationBodySchema = z.object({
  txn: createTxnInputSchema,
});

export const txnUpdateMutationBodySchema = z.object({
  txn: updateTxnInputSchema,
});

const txnSplitChildAmountCentsSchema = txnInputSchema.shape.amountCents.refine(
  (value) => value !== 0,
  'Split child amount must be non-zero'
);

export const splitTxnInputSchema = z.object({
  txnId: txnIdSchema,
  children: z
    .array(
      z.object({
        id: txnIdSchema.optional(),
        item: txnInputSchema.shape.item.optional(),
        description: txnInputSchema.shape.description.optional(),
        amountCents: txnSplitChildAmountCentsSchema,
        categoryId: nullableOptionalCategoryIdSchema,
        subCategoryId: nullableOptionalSubCategoryIdSchema,
      })
    )
    .min(2, 'At least two split children are required'),
});

export const splitTxnMutationBodySchema = z.object({
  split: splitTxnInputSchema,
});

export const transferTxnInputSchema = z.object({
  txnId: txnIdSchema,
  destinationProjectId: projectIdSchema,
  destinationTxnId: txnIdSchema.optional(),
  item: txnInputSchema.shape.item.optional(),
  description: txnInputSchema.shape.description.optional(),
});

export const transferTxnMutationBodySchema = z.object({
  transfer: transferTxnInputSchema,
});

export const txnWorkflowStateInputSchema = z.object({
  txnId: txnIdSchema,
  reviewed: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export const txnWorkflowStateMutationBodySchema = z.object({
  workflow: txnWorkflowStateInputSchema.refine(
    (value) =>
      typeof value.reviewed !== 'undefined' ||
      typeof value.locked !== 'undefined',
    'At least one workflow state field is required'
  ),
});

export const createTxnCommentInputSchema = z.object({
  txnId: txnIdSchema,
  body: txnCommentBodySchema,
  parentCommentId: txnCommentIdSchema.optional(),
  assignedToUserId: userIdSchema.nullable().optional(),
});

export const updateTxnCommentInputSchema = z.object({
  id: txnCommentIdSchema,
  body: txnCommentBodySchema.optional(),
  assignedToUserId: userIdSchema.nullable().optional(),
  resolved: z.boolean().optional(),
});

export const txnCommentMutationBodySchema = z.object({
  comment: createTxnCommentInputSchema,
});

export const txnCommentUpdateMutationBodySchema = z.object({
  comment: updateTxnCommentInputSchema,
});

const importedTxnInputSchema = createTxnInputSchema.extend({
  id: txnIdSchema,
});

export const txnImportInputSchema = z.object({
  txns: z.array(importedTxnInputSchema).max(MAX_IMPORT_TXN_COUNT),
  mode: csvImportModeSchema,
  autoCreateBudgets: z.boolean().optional(),
});

export const txnImportPreviewInputSchema = z.object({
  csvText: z.string().max(MAX_IMPORT_PREVIEW_CSV_TEXT_LENGTH),
  sourceType: importPreviewSourceTypeSchema.optional(),
  fileName: z.string().trim().min(1).max(255).optional(),
  autoCreateStructures: z.boolean().optional(),
});

export const txnListPageQuerySchema = z.object({
  mode: z.literal('page'),
  pageIndex: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortField: txnListSortFieldSchema.optional(),
  sortDirection: txnListSortDirectionSchema.optional(),
  yearFilter: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional(),
  quarterFilter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  monthFilterKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  transactionView: txnListViewSchema.optional(),
  drilldownKind: z.enum(['category', 'subcategory']).optional(),
  categoryId: categoryIdSchema.optional(),
  subCategoryId: subCategoryIdSchema.optional(),
});

export const importCandidateReviewInputSchema = z.object({
  candidateId: importCandidateIdSchema,
  decision: z.enum(['import', 'reject']),
});

export const importCandidateReviewMutationBodySchema = z.object({
  review: importCandidateReviewInputSchema,
});

export const devSessionBodySchema = z.object({
  userId: userIdSchema,
});
