import type {
  ImportBatchId,
  ImportPreviewRow,
  ProjectId,
  Txn,
  TxnId,
} from '../../../types';
import { asBudgetLineId, asImportBatchId } from '../../../types';
import { AppError } from '../../../api/errors';
import type {
  ImportReviewDecision,
  TxnImportTxnInput,
} from '../../../api/types';
import { uid } from '../../../utils/id';
import { planImportPreview } from '../../../utils/importPreviewPlan';
import { planTransactionImportCommit } from '../../../utils/transactionImportCommitPlan';
import { isAuthorized, requireAuthorized } from '../../auth/authorize';
import {
  loadTransactionImportCommitContext,
  loadTransactionImportPreviewContext,
} from '../../loaders/importContext';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import { enforceRateLimit } from '../../rateLimit';
import type { ProjectActionContext } from '../resourceGuards';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  IMPORT_COMMIT_RATE_LIMIT,
  IMPORT_PREVIEW_RATE_LIMIT,
  importCandidateStatusForPreviewRow,
  persistedImportRuleId,
} from './shared';
import { reconcilePendingReversalMatches } from './reversalServers';

export async function importTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txns: TxnImportTxnInput[];
  mode: 'append' | 'replaceAll';
  autoCreateBudgets?: boolean;
  importBatchId?: ImportBatchId;
  excludedImportIds?: TxnId[];
  reviewDecisions?: ImportReviewDecision[];
}): Promise<{ count: number }> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );
    const { db, userId, companyId } = context;
    const importBatchId = importBatchIdForCommit({
      explicitImportBatchId: args.importBatchId,
      incomingTransactions: args.txns,
      excludedImportIds: args.excludedImportIds,
      reviewDecisions: args.reviewDecisions,
    });
    await enforceRateLimit({
      db,
      bucket: `project-import-commit:${companyId}:${args.projectId}:${userId}`,
      limit: IMPORT_COMMIT_RATE_LIMIT.limit,
      windowMs: IMPORT_COMMIT_RATE_LIMIT.windowMs,
      message:
        'Too many import commits. Please wait a few minutes and try again.',
    });
    if (args.autoCreateBudgets) {
      await requireAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId,
        projectId: args.projectId,
      });
    }
    const importContext = await loadTransactionImportCommitContext(db, {
      companyId,
      projectId: args.projectId,
    });

    const plan = planTransactionImportCommit({
      projectId: args.projectId,
      companyId,
      incomingTransactions: args.txns,
      existingTransactions: importContext.existingTransactions,
      existingBudgets: importContext.budgets,
      projectAutoCodingRules: importContext.projectAutoCodingRules,
      mode: args.mode,
      autoCreateBudgets: Boolean(args.autoCreateBudgets),
    });

    if (args.mode === 'replaceAll') {
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await assertImportPreviewCommit({
          db: trx,
          projectId: args.projectId,
          importBatchId,
          incomingTransactions: args.txns,
          excludedImportIds: args.excludedImportIds,
          reviewDecisions: args.reviewDecisions,
        });
        const codedBudgetTargets = [
          ...new Map(
            plan.importedTransactions
              .filter(
                (
                  txn
                ): txn is Txn & {
                  categoryId: NonNullable<Txn['categoryId']>;
                  subCategoryId: NonNullable<Txn['subCategoryId']>;
                } => Boolean(txn.categoryId && txn.subCategoryId)
              )
              .map((txn) => [txn.subCategoryId, txn] as const)
          ).values(),
        ];
        await trx
          .deleteFrom('txns')
          .where('project_id', '=', args.projectId)
          .execute();
        if (plan.budgetTargetsToCreate.length) {
          await trx
            .insertInto('budget_lines')
            .values(
              plan.budgetTargetsToCreate.map((target) => ({
                id: asBudgetLineId(uid('bud')),
                company_id: companyId,
                project_id: args.projectId,
                category_id: target.categoryId,
                sub_category_id: target.subCategoryId,
                allocated_cents: 0,
                created_at: now,
                updated_at: now,
              }))
            )
            .execute();
        }
        await ensureBudgetLinesForProjectSubCategories({
          db: trx,
          companyId,
          projectId: args.projectId,
          targets: codedBudgetTargets.map((txn) => ({
            categoryId: txn.categoryId,
            subCategoryId: txn.subCategoryId,
          })),
        });
        if (plan.importedTransactions.length) {
          await trx
            .insertInto('txns')
            .values(
              plan.importedTransactions.map((txn) => ({
                public_id: txn.id,
                external_id: txn.externalId ?? null,
                company_id: txn.companyId,
                project_id: txn.projectId,
                txn_date: txn.date,
                item: txn.item,
                description: txn.description,
                amount_cents: txn.amountCents,
                txn_type: 'standard',
                parent_public_id: null,
                source_public_id: null,
                transfer_project_id: null,
                budget_impact: true,
                categorisable: true,
                import_batch_id: txn.importBatchId ?? null,
                import_source_type: txn.importSourceType ?? null,
                import_source_meta: txn.importSourceMeta ?? null,
                category_id: txn.categoryId ?? null,
                sub_category_id: txn.subCategoryId ?? null,
                company_default_mapping_rule_id:
                  txn.companyDefaultMappingRuleId ?? null,
                coding_source: txn.codingSource ?? null,
                coding_pending_approval: !!txn.codingPendingApproval,
                created_at: now,
                updated_at: now,
              }))
            )
            .execute();
        }
        await finalizeImportBatchCandidates({
          db: trx,
          importedTransactions: plan.importedTransactions,
          importBatchId,
          excludedImportIds: args.excludedImportIds,
          reviewDecisions: args.reviewDecisions,
          userId,
          now,
        });
      });
      return { count: plan.importedTransactions.length };
    }

    if (plan.importedTransactions.length || importBatchId) {
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await assertImportPreviewCommit({
          db: trx,
          projectId: args.projectId,
          importBatchId,
          incomingTransactions: args.txns,
          excludedImportIds: args.excludedImportIds,
          reviewDecisions: args.reviewDecisions,
        });
        const codedBudgetTargets = [
          ...new Map(
            plan.importedTransactions
              .filter(
                (
                  txn
                ): txn is Txn & {
                  categoryId: NonNullable<Txn['categoryId']>;
                  subCategoryId: NonNullable<Txn['subCategoryId']>;
                } => Boolean(txn.categoryId && txn.subCategoryId)
              )
              .map((txn) => [txn.subCategoryId, txn] as const)
          ).values(),
        ];
        if (plan.budgetTargetsToCreate.length) {
          await trx
            .insertInto('budget_lines')
            .values(
              plan.budgetTargetsToCreate.map((target) => ({
                id: asBudgetLineId(uid('bud')),
                company_id: companyId,
                project_id: args.projectId,
                category_id: target.categoryId,
                sub_category_id: target.subCategoryId,
                allocated_cents: 0,
                created_at: now,
                updated_at: now,
              }))
            )
            .execute();
        }
        await ensureBudgetLinesForProjectSubCategories({
          db: trx,
          companyId,
          projectId: args.projectId,
          targets: codedBudgetTargets.map((txn) => ({
            categoryId: txn.categoryId,
            subCategoryId: txn.subCategoryId,
          })),
        });
        if (plan.importedTransactions.length) {
          await trx
            .insertInto('txns')
            .values(
              plan.importedTransactions.map((txn) => ({
                public_id: txn.id,
                external_id: txn.externalId ?? null,
                company_id: txn.companyId,
                project_id: txn.projectId,
                txn_date: txn.date,
                item: txn.item,
                description: txn.description,
                amount_cents: txn.amountCents,
                txn_type: 'standard',
                parent_public_id: null,
                source_public_id: null,
                transfer_project_id: null,
                budget_impact: true,
                categorisable: true,
                import_batch_id: txn.importBatchId ?? null,
                import_source_type: txn.importSourceType ?? null,
                import_source_meta: txn.importSourceMeta ?? null,
                category_id: txn.categoryId ?? null,
                sub_category_id: txn.subCategoryId ?? null,
                company_default_mapping_rule_id:
                  txn.companyDefaultMappingRuleId ?? null,
                coding_source: txn.codingSource ?? null,
                coding_pending_approval: !!txn.codingPendingApproval,
                created_at: now,
                updated_at: now,
              }))
            )
            .execute();
          await reconcilePendingReversalMatches({
            db: trx,
            companyId,
            projectId: args.projectId,
            userId,
            counterpartTxnIds: plan.importedTransactions.map((txn) => txn.id),
          });
        }
        await finalizeImportBatchCandidates({
          db: trx,
          importedTransactions: plan.importedTransactions,
          importBatchId,
          excludedImportIds: args.excludedImportIds,
          reviewDecisions: args.reviewDecisions,
          userId,
          now,
        });
      });
    }
    return { count: plan.importedTransactions.length };
  });
}

export async function previewImportTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  csvText: string;
  sourceType?: 'powerbi_expenditure_actuals';
  fileName?: string;
  autoCreateStructures?: boolean;
}): Promise<{ importBatchId?: ImportBatchId; rows: ImportPreviewRow[] }> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );
    const { db, userId, companyId } = context;
    await enforceRateLimit({
      db,
      bucket: `project-import-preview:${companyId}:${args.projectId}:${userId}`,
      limit: IMPORT_PREVIEW_RATE_LIMIT.limit,
      windowMs: IMPORT_PREVIEW_RATE_LIMIT.windowMs,
      message:
        'Too many import previews. Please wait a few minutes and try again.',
    });

    if (args.sourceType && args.sourceType !== 'powerbi_expenditure_actuals') {
      throw new AppError(
        'NOT_IMPLEMENTED',
        `Unsupported import source type: ${args.sourceType}`
      );
    }

    const [importContext, canEditTaxonomy, canEditBudgets] = await Promise.all([
      loadTransactionImportPreviewContext(db, {
        companyId,
        projectId: args.projectId,
      }),
      isAuthorized({
        db,
        userId,
        action: 'taxonomy:edit',
        companyId,
        projectId: args.projectId,
      }),
      isAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId,
        projectId: args.projectId,
      }),
    ]);

    const preview = planImportPreview({
      csvText: args.csvText,
      importRules: importContext.importRules,
      existingTransactions: importContext.existingTransactions,
      categories: importContext.projectCategories,
      subCategories: importContext.projectSubCategories,
      budgets: importContext.budgets,
      projectAutoCodingRules: importContext.projectAutoCodingRules,
      autoCreateStructures: Boolean(args.autoCreateStructures),
      canEditTaxonomy,
      canEditBudgets,
    });

    if (!preview.rows.length) {
      throw new AppError(
        'VALIDATION_ERROR',
        'CSV import preview did not contain any transaction rows'
      );
    }

    const importBatchId = await createPowerBiImportBatch({
      db,
      companyId,
      projectId: args.projectId,
      userId,
      fileName: args.fileName ?? 'PowerBI expenditure actuals CSV',
      rows: preview.rows,
    });

    return { importBatchId, rows: preview.rows };
  });
}

export async function cancelImportPreviewServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  importBatchId: ImportBatchId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );

    await db
      .deleteFrom('import_batches')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.importBatchId)
      .where('status', '=', 'previewed')
      .execute();
  });
}

async function createPowerBiImportBatch(args: {
  db: ProjectActionContext['db'];
  companyId: ProjectActionContext['companyId'];
  projectId: ProjectActionContext['projectId'];
  userId: ProjectActionContext['userId'];
  fileName: string;
  rows: ImportPreviewRow[];
}): Promise<ImportBatchId> {
  const now = new Date().toISOString();
  const batchId = asImportBatchId(uid('impb'));

  await args.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('import_batches')
      .values({
        id: batchId,
        company_id: args.companyId,
        project_id: args.projectId,
        source_type: 'powerbi_expenditure_actuals',
        file_name: args.fileName,
        status: 'previewed',
        created_by_user_id: args.userId,
        created_at: now,
        updated_at: now,
      })
      .execute();

    if (!args.rows.length) return;

    await trx
      .insertInto('import_candidates')
      .values(
        args.rows.map((row) => ({
          id: uid('impc'),
          company_id: args.companyId,
          project_id: args.projectId,
          batch_id: batchId,
          source_row_index: row.sourceRowIndex,
          preview_import_id: row.importId,
          raw_row: row.rawSourceRow ?? {},
          status: importCandidateStatusForPreviewRow(row),
          matched_import_rule_id: persistedImportRuleId(row),
          status_reason:
            row.importDecisionReason ?? row.warnings[0] ?? 'Previewed',
          txn_public_id: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: now,
          updated_at: now,
        }))
      )
      .execute();
  });

  return batchId;
}

function importBatchIdForCommit(args: {
  explicitImportBatchId?: ImportBatchId;
  incomingTransactions: TxnImportTxnInput[];
  excludedImportIds?: TxnId[];
  reviewDecisions?: ImportReviewDecision[];
}): ImportBatchId | undefined {
  const transactionBatchIds = [
    ...new Set(
      args.incomingTransactions
        .map((txn) => txn.importBatchId)
        .filter((id): id is ImportBatchId => Boolean(id))
    ),
  ];
  if (transactionBatchIds.length > 1) {
    throw new AppError(
      'VALIDATION_ERROR',
      'An import commit cannot contain transactions from multiple previews'
    );
  }

  const transactionBatchId = transactionBatchIds[0];
  if (
    args.explicitImportBatchId &&
    transactionBatchId &&
    args.explicitImportBatchId !== transactionBatchId
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Transaction import batch does not match the preview being committed'
    );
  }

  const importBatchId = args.explicitImportBatchId ?? transactionBatchId;
  if (
    !importBatchId &&
    (args.excludedImportIds?.length ||
      args.reviewDecisions?.length ||
      args.incomingTransactions.some((txn) => txn.forceUncoded))
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Import preview decisions require an import batch ID'
    );
  }
  return importBatchId;
}

async function assertImportPreviewCommit(args: {
  db: ProjectActionContext['db'];
  projectId: ProjectId;
  importBatchId?: ImportBatchId;
  incomingTransactions: TxnImportTxnInput[];
  excludedImportIds?: TxnId[];
  reviewDecisions?: ImportReviewDecision[];
}): Promise<void> {
  if (!args.importBatchId) return;

  const batch = await args.db
    .selectFrom('import_batches')
    .select('status')
    .where('id', '=', args.importBatchId)
    .where('project_id', '=', args.projectId)
    .forUpdate()
    .executeTakeFirst();
  if (!batch) throw new AppError('NOT_FOUND', 'Unknown import preview');
  if (batch.status !== 'previewed') {
    throw new AppError('CONFLICT', 'This import preview was already committed');
  }

  const candidates = await args.db
    .selectFrom('import_candidates')
    .select(['preview_import_id', 'status'])
    .where('batch_id', '=', args.importBatchId)
    .where('project_id', '=', args.projectId)
    .forUpdate()
    .execute();
  const candidateByImportId = new Map(
    candidates.flatMap((candidate) =>
      candidate.preview_import_id
        ? [[candidate.preview_import_id, candidate] as const]
        : []
    )
  );
  const incomingById = new Map(
    args.incomingTransactions.map((txn) => [String(txn.id), txn] as const)
  );
  const excludedIds = new Set(
    (args.excludedImportIds ?? []).map((id) => String(id))
  );
  const reviewDecisionById = new Map<
    string,
    ImportReviewDecision['decision']
  >();

  for (const decision of args.reviewDecisions ?? []) {
    const importId = String(decision.previewImportId);
    if (reviewDecisionById.has(importId)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Each review row must have exactly one decision'
      );
    }
    reviewDecisionById.set(importId, decision.decision);
  }

  for (const txn of args.incomingTransactions) {
    const importId = String(txn.id);
    if (txn.importBatchId !== args.importBatchId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Every imported transaction must belong to the committed preview'
      );
    }
    const candidate = candidateByImportId.get(importId);
    if (!candidate) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Imported transaction does not belong to this preview'
      );
    }
    if (candidate.status === 'excluded' || candidate.status === 'invalid') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Excluded or invalid preview rows cannot be imported'
      );
    }
    if (txn.forceUncoded && candidate.status !== 'needs_project_review') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Only review rows selected for uncoded import can bypass automatic coding'
      );
    }
    if (excludedIds.has(importId)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A preview row cannot be both imported and excluded'
      );
    }
  }

  for (const importId of excludedIds) {
    if (!candidateByImportId.has(importId)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Excluded row does not belong to this preview'
      );
    }
  }

  for (const [importId, decision] of reviewDecisionById) {
    if (candidateByImportId.get(importId)?.status !== 'needs_project_review') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Review decision does not belong to a review row in this preview'
      );
    }
    const incoming = incomingById.get(importId);
    if (decision === 'import_uncoded') {
      if (!incoming || !incoming.forceUncoded || excludedIds.has(importId)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Rows approved for import review must be imported without coding'
        );
      }
    } else if (incoming || !excludedIds.has(importId)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Rows excluded during import review must not be imported'
      );
    }
  }

  for (const [importId, candidate] of candidateByImportId) {
    if (candidate.status === 'needs_project_review') {
      if (!reviewDecisionById.has(importId)) {
        throw new AppError(
          'CONFLICT',
          'Resolve every review row before committing the import'
        );
      }
      continue;
    }
    if (
      candidate.status === 'ready' &&
      !incomingById.has(importId) &&
      !excludedIds.has(importId)
    ) {
      throw new AppError(
        'CONFLICT',
        'Resolve every included preview row before committing the import'
      );
    }
  }
}

async function finalizeImportBatchCandidates(args: {
  db: ProjectActionContext['db'];
  importedTransactions: Txn[];
  importBatchId?: ImportBatchId;
  excludedImportIds?: TxnId[];
  reviewDecisions?: ImportReviewDecision[];
  userId: ProjectActionContext['userId'];
  now: string;
}): Promise<void> {
  const batchIds = [
    ...new Set(
      [
        args.importBatchId,
        ...args.importedTransactions.map((txn) => txn.importBatchId),
      ].filter((id): id is ImportBatchId => Boolean(id))
    ),
  ];
  if (!batchIds.length) return;

  const importedIds = args.importedTransactions.map((txn) => String(txn.id));
  if (importedIds.length) {
    await args.db
      .updateTable('import_candidates')
      .set((eb) => ({
        status: 'imported',
        txn_public_id: eb.ref('preview_import_id'),
        updated_at: args.now,
      }))
      .where('batch_id', 'in', batchIds)
      .where('preview_import_id', 'in', importedIds)
      .execute();
  }

  const excludedIds = (args.excludedImportIds ?? []).map((id) => String(id));
  if (excludedIds.length) {
    await args.db
      .updateTable('import_candidates')
      .set({
        status: 'excluded',
        reviewed_by_user_id: args.userId,
        reviewed_at: args.now,
        updated_at: args.now,
      })
      .where('batch_id', 'in', batchIds)
      .where('preview_import_id', 'in', excludedIds)
      .where('status', '!=', 'imported')
      .execute();
  }

  const importedReviewIds = (args.reviewDecisions ?? [])
    .filter((decision) => decision.decision === 'import_uncoded')
    .map((decision) => String(decision.previewImportId));
  if (importedReviewIds.length) {
    await args.db
      .updateTable('import_candidates')
      .set({
        reviewed_by_user_id: args.userId,
        reviewed_at: args.now,
        updated_at: args.now,
      })
      .where('batch_id', 'in', batchIds)
      .where('preview_import_id', 'in', importedReviewIds)
      .where('status', '=', 'imported')
      .execute();
  }

  await args.db
    .updateTable('import_batches')
    .set({ status: 'imported', updated_at: args.now })
    .where('id', 'in', batchIds)
    .execute();
}
