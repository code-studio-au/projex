import { z } from 'zod';

import type { ImportPreviewRow } from '../types';

const optionalIdSchema = z.string().trim().min(1).max(255).optional();
const optionalNameSchema = z.string().trim().min(1).max(255).optional();

export const persistedImportPreviewRowSchema = z
  .object({
    sourceRowIndex: z.number().int().positive(),
    importId: z.string().trim().min(1).max(255),
    externalId: z.string().trim().min(1).max(500).optional(),
    parsedDate: z.string().nullable(),
    amountCents: z.number().int().nullable(),
    item: z.string().nullable(),
    description: z.string().nullable(),
    duplicate: z.boolean(),
    duplicateReason: z.enum(['existing', 'import']).optional(),
    importAction: z.enum(['import', 'exclude', 'review']),
    importRuleId: optionalIdSchema,
    importRuleName: optionalNameSchema,
    importDecisionReason: z.string().optional(),
    mappingStatus: z.enum([
      'matched_rule',
      'source_taxonomy',
      'auto_created',
      'uncoded',
      'invalid',
    ]),
    categoryId: optionalIdSchema,
    subCategoryId: optionalIdSchema,
    categoryName: optionalNameSchema,
    subCategoryName: optionalNameSchema,
    ruleId: optionalIdSchema,
    codingSource: z
      .enum(['manual', 'company_default_rule', 'project_rule'])
      .optional(),
    codingPendingApproval: z.boolean(),
    willCreateCategory: z.boolean(),
    willCreateSubCategory: z.boolean(),
    willCreateBudgetLine: z.boolean(),
    sourceType: z.literal('powerbi_expenditure_actuals').optional(),
    rawSourceRow: z.record(z.string(), z.string()).optional(),
    warnings: z.array(z.string()),
  })
  .strict()
  .transform((row) => row as ImportPreviewRow);
