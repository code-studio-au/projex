import { z } from 'zod';

const quarterSchema = z.enum(['Q1', 'Q2', 'Q3', 'Q4']);

export const projectWorkspaceSearchSchema = z.object({
  tab: z
    .enum(['budget', 'transactions', 'import', 'settings'])
    .optional()
    .catch(undefined),
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .catch(undefined),
  quarter: quarterSchema.optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
  view: z
    .enum([
      'all',
      'uncoded',
      'needs-review',
      'auto-mapped-pending',
      'reversal-review',
      'unlock-requests',
      'assigned-to-me',
      'pending-reversal',
      'matched-reversal-pairs',
    ])
    .optional()
    .catch(undefined),
  q: z.string().trim().min(2).max(200).optional().catch(undefined),
  commentTxn: z.string().trim().min(1).optional().catch(undefined),
  commentId: z.string().trim().min(1).optional().catch(undefined),
  source: z
    .enum(['company-summary', 'company-work-queue'])
    .optional()
    .catch(undefined),
  focus: z
    .enum(['budget', 'actual', 'remaining', 'uncoded', 'health'])
    .optional()
    .catch(undefined),
  drilldownKind: z
    .enum(['category', 'subcategory'])
    .optional()
    .catch(undefined),
  categoryId: z.string().trim().min(1).optional().catch(undefined),
  subCategoryId: z.string().trim().min(1).optional().catch(undefined),
  categoryName: z.string().trim().min(1).optional().catch(undefined),
  subCategoryName: z.string().trim().min(1).optional().catch(undefined),
});
