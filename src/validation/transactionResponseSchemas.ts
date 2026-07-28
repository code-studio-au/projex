import { z } from 'zod';
import {
  TXN_REVERSAL_SIDES,
  TXN_REVERSAL_STATUSES,
  TXN_TYPES,
} from '../types/index.ts';
import { MAX_BULK_TXN_COUNT } from '../utils/transactionLimits.ts';
import { idSchema, transactionAmountCentsSchema } from './schemas.ts';
import {
  categoryIdResponseSchema,
  companyIdResponseSchema,
  importBatchIdResponseSchema,
  isoTimestampResponseSchema,
  mappingRuleIdResponseSchema,
  optionalIsoTimestampResponseSchema,
  projectIdResponseSchema,
  subCategoryIdResponseSchema,
  txnCommentIdResponseSchema,
  txnIdResponseSchema,
  txnUnlockRequestIdResponseSchema,
  userIdResponseSchema,
} from './responseSchemaPrimitives.ts';

const codingSourceResponseSchema = z.enum([
  'manual',
  'company_default_rule',
  'project_rule',
]);

export const txnImportPreviewResultResponseSchema = z.object({
  importBatchId: importBatchIdResponseSchema,
  rows: z.array(
    z
      .object({
        importId: idSchema,
      })
      .passthrough()
  ),
});

const txnResponseSchema = z.object({
  id: txnIdResponseSchema,
  internalId: z.string().optional(),
  externalId: z.string().optional(),
  companyId: companyIdResponseSchema,
  projectId: projectIdResponseSchema,
  date: z.string(),
  item: z.string(),
  description: z.string(),
  amountCents: transactionAmountCentsSchema,
  txnType: z.enum(TXN_TYPES),
  parentTxnId: txnIdResponseSchema.optional(),
  sourceTxnId: txnIdResponseSchema.optional(),
  transferProjectId: projectIdResponseSchema.optional(),
  budgetImpact: z.boolean(),
  categorisable: z.boolean(),
  importBatchId: importBatchIdResponseSchema.optional(),
  importSourceType: z.enum(['powerbi_expenditure_actuals']).optional(),
  importSourceMeta: z.record(z.string(), z.string()).optional(),
  categoryId: categoryIdResponseSchema.optional(),
  subCategoryId: subCategoryIdResponseSchema.optional(),
  companyDefaultMappingRuleId: mappingRuleIdResponseSchema.optional(),
  codingSource: codingSourceResponseSchema.optional(),
  codingPendingApproval: z.boolean().optional(),
  reviewedAt: optionalIsoTimestampResponseSchema,
  reviewedByUserId: userIdResponseSchema.optional(),
  lockedAt: optionalIsoTimestampResponseSchema,
  lockedByUserId: userIdResponseSchema.optional(),
  workflowVersion: z.number().int().nonnegative(),
  pendingUnlockRequest: z
    .object({
      id: txnUnlockRequestIdResponseSchema,
      txnId: txnIdResponseSchema,
      status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
      reason: z.string(),
      requestedByUserId: userIdResponseSchema,
      requestedAt: isoTimestampResponseSchema,
      resolvedByUserId: userIdResponseSchema.optional(),
      resolvedAt: optionalIsoTimestampResponseSchema,
      resolutionReason: z.string().optional(),
      version: z.number().int().positive(),
    })
    .optional(),
  reversal: z
    .object({
      id: z.string(),
      status: z.enum(TXN_REVERSAL_STATUSES),
      side: z.enum(TXN_REVERSAL_SIDES),
      version: z.number().int().positive(),
      counterpartTxnId: txnIdResponseSchema.optional(),
      expectedProjectId: projectIdResponseSchema.optional(),
      matchMethod: z.enum(['manual', 'auto_clear', 'auto_default']).optional(),
      matchScore: z.number().int().nonnegative().optional(),
      candidateCount: z.number().int().positive().optional(),
      matchEvidence: z
        .object({
          amountExact: z.boolean().optional(),
          oppositeSign: z.boolean().optional(),
          dayDelta: z.number().int().optional(),
          withinAutoWindow: z.boolean().optional(),
          sourceSystem: z
            .object({
              sourceValue: z.string().optional(),
              counterpartValue: z.string().optional(),
              outcome: z.enum([
                'match',
                'missing',
                'mismatch',
                'not_applicable',
              ]),
            })
            .optional(),
          journalDescription: z
            .object({
              sourceValue: z.string().optional(),
              counterpartValue: z.string().optional(),
              outcome: z.enum([
                'match',
                'missing',
                'mismatch',
                'not_applicable',
              ]),
            })
            .optional(),
          reference: z
            .object({
              sourceValue: z.string().optional(),
              counterpartValue: z.string().optional(),
              outcome: z.enum([
                'match',
                'missing',
                'mismatch',
                'not_applicable',
              ]),
            })
            .optional(),
          costCentre: z
            .object({
              sourceValue: z.string().optional(),
              counterpartValue: z.string().optional(),
              outcome: z.enum([
                'match',
                'missing',
                'mismatch',
                'not_applicable',
              ]),
            })
            .optional(),
          sourceCandidateCount: z.number().int().nonnegative().optional(),
          counterpartCandidateCount: z.number().int().nonnegative().optional(),
          alternativeCounterparts: z
            .array(
              z.object({
                txnId: txnIdResponseSchema,
                externalId: z.string().optional(),
                date: z.string(),
                item: z.string(),
                description: z.string(),
                amountCents: transactionAmountCentsSchema,
                sourceType: z.string().optional(),
                sourceSystem: z.string().optional(),
                journalDescription: z.string().optional(),
                reference: z.string().optional(),
                costCentre: z.string().optional(),
              })
            )
            .optional(),
          reasons: z.array(z.string()),
          legacy: z.boolean().optional(),
        })
        .optional(),
      sourceTxn: z
        .object({
          txnId: txnIdResponseSchema,
          externalId: z.string().optional(),
          date: z.string(),
          item: z.string(),
          description: z.string(),
          amountCents: transactionAmountCentsSchema,
          sourceType: z.string().optional(),
          sourceSystem: z.string().optional(),
          journalDescription: z.string().optional(),
          reference: z.string().optional(),
          costCentre: z.string().optional(),
        })
        .optional(),
      counterpartTxn: z
        .object({
          txnId: txnIdResponseSchema,
          externalId: z.string().optional(),
          date: z.string(),
          item: z.string(),
          description: z.string(),
          amountCents: transactionAmountCentsSchema,
          sourceType: z.string().optional(),
          sourceSystem: z.string().optional(),
          journalDescription: z.string().optional(),
          reference: z.string().optional(),
          costCentre: z.string().optional(),
        })
        .optional(),
      proposedAt: optionalIsoTimestampResponseSchema,
      proposedByUserId: userIdResponseSchema.optional(),
      markedAt: optionalIsoTimestampResponseSchema,
      markedByUserId: userIdResponseSchema.optional(),
      matchedAt: optionalIsoTimestampResponseSchema,
      matchedByUserId: userIdResponseSchema.optional(),
      createdAt: optionalIsoTimestampResponseSchema,
      updatedAt: optionalIsoTimestampResponseSchema,
    })
    .optional(),
  createdAt: optionalIsoTimestampResponseSchema,
  updatedAt: optionalIsoTimestampResponseSchema,
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
  codingApprovalCount: z.number().int().nonnegative(),
  reversalReviewCount: z.number().int().nonnegative(),
  reversalMatchReviewCount: z.number().int().nonnegative(),
  awaitingReversalCount: z.number().int().nonnegative(),
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

const txnReversalSelectionSummaryResponseSchema = z.object({
  txnId: txnIdResponseSchema,
  externalId: z.string().optional(),
  date: z.string(),
  item: z.string(),
  description: z.string(),
  amountCents: transactionAmountCentsSchema,
  sourceType: z.string().optional(),
  sourceSystem: z.string().optional(),
  journalDescription: z.string().optional(),
  reference: z.string().optional(),
  costCentre: z.string().optional(),
});

export const txnBulkSelectionResultResponseSchema = z.object({
  rows: z
    .array(
      z.object({
        id: txnIdResponseSchema,
        categorisable: z.boolean(),
        subCategoryId: subCategoryIdResponseSchema.optional(),
        codingPendingApproval: z.boolean(),
        locked: z.boolean(),
        workflowVersion: z.number().int().nonnegative(),
        reversal: z
          .object({
            id: z.string(),
            status: z.enum(TXN_REVERSAL_STATUSES),
            side: z.enum(TXN_REVERSAL_SIDES),
            version: z.number().int().positive(),
            matchMethod: z
              .enum(['manual', 'auto_clear', 'auto_default'])
              .optional(),
            sourceTxn: txnReversalSelectionSummaryResponseSchema.optional(),
            counterpartTxn:
              txnReversalSelectionSummaryResponseSchema.optional(),
          })
          .optional(),
      })
    )
    .max(MAX_BULK_TXN_COUNT),
});

export const txnCommentResponseSchema = z.object({
  id: txnCommentIdResponseSchema,
  companyId: companyIdResponseSchema,
  projectId: projectIdResponseSchema,
  txnId: txnIdResponseSchema,
  parentCommentId: txnCommentIdResponseSchema.optional(),
  body: z.string(),
  assignedToUserId: userIdResponseSchema.optional(),
  createdByUserId: userIdResponseSchema,
  createdByName: z.string(),
  resolvedAt: optionalIsoTimestampResponseSchema,
  resolvedByUserId: userIdResponseSchema.optional(),
  createdAt: isoTimestampResponseSchema,
  updatedAt: isoTimestampResponseSchema,
});
