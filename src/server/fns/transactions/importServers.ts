import type {
  ImportBatchId,
  ImportCandidate,
  ImportCandidateId,
  ImportPreviewRow,
  ProjectId,
  Txn,
} from '../../../types';
import { asBudgetLineId, asImportBatchId, asTxnId } from '../../../types';
import { AppError } from '../../../api/errors';
import type { TxnImportTxnInput } from '../../../api/types';
import { uid } from '../../../utils/id';
import { planImportPreview } from '../../../utils/importPreviewPlan';
import { planTransactionImportCommit } from '../../../utils/transactionImportCommitPlan';
import {
  powerBiAmountCents,
  powerBiDescription,
  powerBiExternalId,
  powerBiItem,
  powerBiTransactionDate,
  toPowerBiExpenditureActualsRow,
} from '../../../utils/powerBiImport';
import { isAuthorized, requireAuthorized } from '../../auth/authorize';
import { toTxn } from '../../mappers/transactionRows';
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
import { assertImportCandidateBatchStatus } from './readServers';
import {
  IMPORT_COMMIT_RATE_LIMIT,
  IMPORT_PREVIEW_RATE_LIMIT,
  IMPORT_REVIEW_RATE_LIMIT,
  importCandidateSelectColumns,
  importCandidateStatusForPreviewRow,
  persistedImportRuleId,
  toImportCandidate,
  txnSelectColumns,
  type ImportCandidateRow,
} from './shared';

export async function importTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txns: TxnImportTxnInput[];
  mode: 'append' | 'replaceAll';
  autoCreateBudgets?: boolean;
}): Promise<{ count: number }> {
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
        if (!plan.importedTransactions.length) return;
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
        await markImportedBatchCandidates(trx, plan.importedTransactions, now);
      });
      return { count: plan.importedTransactions.length };
    }

    if (plan.importedTransactions.length) {
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
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
        await markImportedBatchCandidates(trx, plan.importedTransactions, now);
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

export async function listImportCandidatesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ImportCandidate[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );

    const rows = await db
      .selectFrom('import_candidates')
      .select(importCandidateSelectColumns())
      .where('project_id', '=', args.projectId)
      .where('batch_id', 'in', (eb) =>
        eb
          .selectFrom('import_batches')
          .select('id')
          .where('project_id', '=', args.projectId)
          .where('status', 'in', ['partially_imported', 'imported'])
      )
      .orderBy('created_at', 'desc')
      .orderBy('source_row_index', 'asc')
      .execute();
    return rows.map((row) => toImportCandidate(row as ImportCandidateRow));
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

export async function reviewImportCandidateServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  candidateId: ImportCandidateId;
  decision: 'import' | 'reject';
}): Promise<{ candidate: ImportCandidate; txn?: Txn }> {
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
      bucket: `project-import-review:${companyId}:${args.projectId}:${userId}`,
      limit: IMPORT_REVIEW_RATE_LIMIT.limit,
      windowMs: IMPORT_REVIEW_RATE_LIMIT.windowMs,
      message:
        'Too many import review actions. Please wait a few minutes and try again.',
    });

    const existing = await db
      .selectFrom('import_candidates')
      .select(importCandidateSelectColumns())
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.candidateId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown import candidate');
    if (existing.status !== 'needs_project_review') {
      throw new AppError(
        'CONFLICT',
        'Only candidates waiting for project review can be actioned'
      );
    }
    const batch = await db
      .selectFrom('import_batches')
      .select('status')
      .where('project_id', '=', args.projectId)
      .where('id', '=', existing.batch_id)
      .executeTakeFirst();
    assertImportCandidateBatchStatus(batch?.status);

    const now = new Date().toISOString();
    if (args.decision === 'reject') {
      const row = await db.transaction().execute(async (trx) => {
        const candidate = await trx
          .updateTable('import_candidates')
          .set({
            status: 'rejected',
            reviewed_by_user_id: userId,
            reviewed_at: now,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('id', '=', args.candidateId)
          .returning(importCandidateSelectColumns())
          .executeTakeFirstOrThrow();
        await syncImportBatchStatuses(
          trx,
          [asImportBatchId(existing.batch_id)],
          now
        );
        return candidate;
      });
      return { candidate: toImportCandidate(row as ImportCandidateRow) };
    }

    const powerBiRow = toPowerBiExpenditureActualsRow(existing.raw_row);
    const importContext = await loadTransactionImportCommitContext(db, {
      companyId,
      projectId: args.projectId,
    });
    const planned = planTransactionImportCommit({
      projectId: args.projectId,
      companyId,
      incomingTransactions: [
        {
          id: asTxnId(uid('txn')),
          externalId: powerBiExternalId(powerBiRow) || undefined,
          companyId,
          projectId: args.projectId,
          date: powerBiTransactionDate(powerBiRow),
          item: powerBiItem(powerBiRow),
          description: powerBiDescription(powerBiRow),
          amountCents: powerBiAmountCents(powerBiRow),
          importBatchId: asImportBatchId(existing.batch_id),
          importSourceType: 'powerbi_expenditure_actuals',
          importSourceMeta: existing.raw_row,
        },
      ],
      existingTransactions: importContext.existingTransactions,
      existingBudgets: importContext.budgets,
      projectAutoCodingRules: importContext.projectAutoCodingRules,
      mode: 'append',
      autoCreateBudgets: false,
    });
    const txn = planned.importedTransactions[0];
    if (!txn) throw new AppError('INTERNAL_ERROR', 'Import candidate failed');

    let insertedTxn: Txn | undefined;
    let updatedCandidate: ImportCandidate | undefined;
    await db.transaction().execute(async (trx) => {
      if (txn.categoryId && txn.subCategoryId) {
        await ensureBudgetLinesForProjectSubCategories({
          db: trx,
          companyId,
          projectId: args.projectId,
          targets: [
            {
              categoryId: txn.categoryId,
              subCategoryId: txn.subCategoryId,
            },
          ],
        });
      }
      const txnRow = await trx
        .insertInto('txns')
        .values({
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
        })
        .returning(txnSelectColumns())
        .executeTakeFirstOrThrow();
      insertedTxn = toTxn(txnRow);

      const candidateRow = await trx
        .updateTable('import_candidates')
        .set({
          status: 'imported',
          txn_public_id: txn.id,
          reviewed_by_user_id: userId,
          reviewed_at: now,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('id', '=', args.candidateId)
        .returning(importCandidateSelectColumns())
        .executeTakeFirstOrThrow();
      updatedCandidate = toImportCandidate(candidateRow as ImportCandidateRow);

      await syncImportBatchStatuses(
        trx,
        [asImportBatchId(existing.batch_id)],
        now
      );
    });

    if (!updatedCandidate || !insertedTxn) {
      throw new AppError('INTERNAL_ERROR', 'Import candidate failed');
    }
    return { candidate: updatedCandidate, txn: insertedTxn };
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

async function markImportedBatchCandidates(
  db: ProjectActionContext['db'],
  importedTransactions: Txn[],
  now: string
): Promise<void> {
  const batchIds = [
    ...new Set(
      importedTransactions
        .map((txn) => txn.importBatchId)
        .filter((id): id is ImportBatchId => Boolean(id))
    ),
  ];
  if (!batchIds.length) return;
  const importedIds = importedTransactions.map((txn) => String(txn.id));

  await db
    .updateTable('import_candidates')
    .set({
      status: 'imported',
      updated_at: now,
    })
    .where('batch_id', 'in', batchIds)
    .where('preview_import_id', 'in', importedIds)
    .where('status', '=', 'ready')
    .execute();

  await db
    .updateTable('import_batches')
    .set({
      status: 'partially_imported',
      updated_at: now,
    })
    .where('id', 'in', batchIds)
    .execute();

  await syncImportBatchStatuses(db, batchIds, now);
}

async function syncImportBatchStatuses(
  db: ProjectActionContext['db'],
  batchIds: ImportBatchId[],
  now: string
): Promise<void> {
  if (!batchIds.length) return;

  const candidateRows = await db
    .selectFrom('import_candidates')
    .select(['batch_id', 'status'])
    .where('batch_id', 'in', batchIds)
    .execute();

  const partiallyImportedIds = new Set<string>();
  for (const row of candidateRows) {
    if (row.status === 'ready' || row.status === 'needs_project_review') {
      partiallyImportedIds.add(row.batch_id);
    }
  }

  const importedBatchIds = batchIds.filter(
    (batchId) => !partiallyImportedIds.has(batchId)
  );
  const partialBatchIds = batchIds.filter((batchId) =>
    partiallyImportedIds.has(batchId)
  );

  if (partialBatchIds.length) {
    await db
      .updateTable('import_batches')
      .set({
        status: 'partially_imported',
        updated_at: now,
      })
      .where('id', 'in', partialBatchIds)
      .execute();
  }

  if (importedBatchIds.length) {
    await db
      .updateTable('import_batches')
      .set({
        status: 'imported',
        updated_at: now,
      })
      .where('id', 'in', importedBatchIds)
      .execute();
  }
}
