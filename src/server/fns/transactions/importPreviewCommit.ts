import type { Transaction } from 'kysely';

import { AppError } from '../../../api/errors';
import type { ImportReviewDecision } from '../../../api/types';
import type {
  CategoryId,
  CompanyId,
  ImportBatchId,
  ImportPreviewRow,
  ProjectId,
  SubCategoryId,
  Txn,
  TxnId,
  UserId,
} from '../../../types';
import { asCategoryId, asSubCategoryId, asTxnId } from '../../../types';
import { uid } from '../../../utils/id';
import { omitUndefinedProperties } from '../../../utils/optionalProperties';
import {
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  withStandardTxnAccountingMetadata,
} from '../../../utils/transactions';
import { persistedImportPreviewRowSchema } from '../../../validation/importPreviewSchemas';
import { txnInputSchema } from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import type { DB } from '../../db/schema';
import { recordAuditLogEvent } from '../../logging/auditLogger';
import { buildLocalProjectStandardMetadata } from '../../sync/projectStandards';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import { reconcilePendingReversalMatches } from './reversalServers';

type CommitMode = 'append' | 'replaceAll';

type LockedCandidate = {
  id: string;
  source_row_index: number;
  preview_import_id: string | null;
  preview_plan: ImportPreviewRow | null;
  status: string;
};

export type ImportPreviewCommitResult = {
  count: number;
  skipped: number;
  replaced: number;
};

export async function commitImportPreviewBatch(args: {
  db: Transaction<DB>;
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  importBatchId: ImportBatchId;
  mode: CommitMode;
  skipDuplicates: boolean;
  excludedSourceRowIndexes?: number[];
  reviewDecisions?: ImportReviewDecision[];
  canEditTaxonomy: boolean;
  canEditBudgets: boolean;
}): Promise<ImportPreviewCommitResult> {
  const batch = await args.db
    .selectFrom('import_batches')
    .select([
      'status',
      'auto_create_structures',
      'source_type',
      'preview_from_date',
      'preview_to_date',
    ])
    .where('id', '=', args.importBatchId)
    .where('company_id', '=', args.companyId)
    .where('project_id', '=', args.projectId)
    .forUpdate()
    .executeTakeFirst();

  if (!batch) throw new AppError('NOT_FOUND', 'Unknown import preview');
  if (batch.status !== 'previewed') {
    throw new AppError('CONFLICT', 'This import preview was already committed');
  }

  const candidates = await args.db
    .selectFrom('import_candidates')
    .select([
      'id',
      'source_row_index',
      'preview_import_id',
      'preview_plan',
      'status',
    ])
    .where('batch_id', '=', args.importBatchId)
    .where('project_id', '=', args.projectId)
    .orderBy('source_row_index', 'asc')
    .forUpdate()
    .execute();

  const lockedCandidates = candidates.map((candidate) => ({
    ...candidate,
    preview_plan: parsePreviewPlan(candidate.preview_plan),
  })) satisfies LockedCandidate[];
  const selection = resolveCommitSelection({
    candidates: lockedCandidates,
    mode: args.mode,
    skipDuplicates: args.skipDuplicates,
    ...omitUndefinedProperties({
      excludedSourceRowIndexes: args.excludedSourceRowIndexes,
      reviewDecisions: args.reviewDecisions,
    }),
  });

  const createsTaxonomy = selection.rows.some(
    ({ row, importUncoded }) =>
      !importUncoded && (row.willCreateCategory || row.willCreateSubCategory)
  );
  const createsBudgets = selection.rows.some(
    ({ row, importUncoded }) => !importUncoded && row.willCreateBudgetLine
  );
  if (createsTaxonomy && !args.canEditTaxonomy) {
    throw new AppError(
      'FORBIDDEN',
      'You no longer have permission to create import categories or subcategories'
    );
  }
  if (createsBudgets && !args.canEditBudgets) {
    throw new AppError(
      'FORBIDDEN',
      'You no longer have permission to create import budget lines'
    );
  }
  if ((createsTaxonomy || createsBudgets) && !batch.auto_create_structures) {
    throw new AppError(
      'CONFLICT',
      'The persisted import preview did not authorize structure creation'
    );
  }

  const taxonomy = await resolveImportTaxonomy({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    rows: selection.rows,
    autoCreateStructures: batch.auto_create_structures,
  });
  const plannedRows = selection.rows.map(({ row, importUncoded }) => ({
    sourceRowIndex: row.sourceRowIndex,
    transaction: transactionFromPreviewRow({
      row,
      importUncoded,
      companyId: args.companyId,
      projectId: args.projectId,
      importBatchId: args.importBatchId,
      taxonomy,
    }),
  }));
  const plannedTransactions = plannedRows.map(({ transaction }) => transaction);

  const replacementIds =
    args.mode === 'replaceAll'
      ? await replacementTransactionIds({
          db: args.db,
          projectId: args.projectId,
          sourceType: batch.source_type as NonNullable<Txn['importSourceType']>,
          fromDate: toDateOnly(batch.preview_from_date),
          toDate: toDateOnly(batch.preview_to_date),
        })
      : [];
  const existingTransactions = await loadExistingTransactionKeys({
    db: args.db,
    projectId: args.projectId,
    excludingIds: replacementIds,
  });
  const deduped = applyCommitDuplicatePolicy({
    existingTransactions,
    incomingTransactions: plannedTransactions,
    skipDuplicates: args.mode === 'append' && args.skipDuplicates,
  });

  if (replacementIds.length) {
    const deleted = await args.db
      .deleteFrom('txns')
      .where('project_id', '=', args.projectId)
      .where('public_id', 'in', replacementIds)
      .executeTakeFirst();
    if (Number(deleted.numDeletedRows) !== replacementIds.length) {
      throw new AppError(
        'CONFLICT',
        'Transaction eligibility changed while replacing the import period'
      );
    }
  }

  if (batch.auto_create_structures) {
    await ensureBudgetLinesForProjectSubCategories({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      targets: deduped.transactions.flatMap((txn) =>
        txn.categoryId && txn.subCategoryId
          ? [
              {
                categoryId: txn.categoryId,
                subCategoryId: txn.subCategoryId,
              },
            ]
          : []
      ),
    });
  }

  const now = new Date().toISOString();
  if (deduped.transactions.length) {
    await args.db
      .insertInto('txns')
      .values(
        deduped.transactions.map((txn) => ({
          public_id: txn.id,
          external_id: txn.externalId ?? null,
          company_id: txn.companyId,
          project_id: txn.projectId,
          txn_date: txn.date,
          item: txn.item,
          description: txn.description,
          amount_cents: txn.amountCents,
          txn_type: 'standard' as const,
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: args.importBatchId,
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
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      userId: args.userId,
      counterpartTxnIds: deduped.transactions.map((txn) => txn.id),
    });
  }

  await finalizePreviewBatch({
    db: args.db,
    importBatchId: args.importBatchId,
    importedSourceRows: deduped.transactions.map((transaction) => {
      const planned = plannedRows.find(
        (row) => row.transaction.id === transaction.id
      );
      if (!planned) {
        throw new AppError(
          'CONFLICT',
          'Imported transaction no longer belongs to the committed preview'
        );
      }
      return planned.sourceRowIndex;
    }),
    excludedSourceRows: selection.excludedSourceRows,
    importedReviewSourceRows: selection.importedReviewSourceRows,
    userId: args.userId,
    now,
  });

  await recordAuditLogEvent({
    companyId: args.companyId,
    projectId: args.projectId,
    actorUserId: args.userId,
    eventClass: 'import',
    eventType: 'transaction_import.committed',
    entityType: 'import_batch',
    entityId: args.importBatchId,
    affectedCount: deduped.transactions.length,
  });

  return {
    count: deduped.transactions.length,
    skipped: selection.previewDuplicateCount + deduped.skipped,
    replaced: replacementIds.length,
  };
}

function parsePreviewPlan(value: ImportPreviewRow | null): ImportPreviewRow {
  const parsed = persistedImportPreviewRowSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      'CONFLICT',
      'This import preview predates the current import format. Cancel it and create a new preview.'
    );
  }
  return parsed.data;
}

function resolveCommitSelection(args: {
  candidates: Array<LockedCandidate & { preview_plan: ImportPreviewRow }>;
  excludedSourceRowIndexes?: number[];
  reviewDecisions?: ImportReviewDecision[];
  mode: CommitMode;
  skipDuplicates: boolean;
}) {
  const candidateBySourceRow = new Map(
    args.candidates.map((candidate) => [candidate.source_row_index, candidate])
  );
  const excludedSourceRows = new Set(args.excludedSourceRowIndexes ?? []);
  for (const sourceRowIndex of excludedSourceRows) {
    if (!candidateBySourceRow.has(sourceRowIndex)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Excluded row does not belong to this preview'
      );
    }
  }

  const decisionBySourceRow = new Map<
    number,
    ImportReviewDecision['decision']
  >();
  for (const decision of args.reviewDecisions ?? []) {
    const sourceRowIndex = decision.sourceRowIndex;
    if (decisionBySourceRow.has(sourceRowIndex)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Each review row must have exactly one decision'
      );
    }
    const candidate = candidateBySourceRow.get(sourceRowIndex);
    if (!candidate || candidate.status !== 'needs_project_review') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Review decision does not belong to a review row in this preview'
      );
    }
    decisionBySourceRow.set(sourceRowIndex, decision.decision);
  }

  const rows: Array<{ row: ImportPreviewRow; importUncoded: boolean }> = [];
  const importedReviewSourceRows: number[] = [];
  let previewDuplicateCount = 0;

  for (const candidate of args.candidates) {
    const row = candidate.preview_plan;
    const sourceRowIndex = row.sourceRowIndex;
    if (
      candidate.source_row_index !== sourceRowIndex ||
      candidate.preview_import_id !== row.importId
    ) {
      throw new AppError(
        'CONFLICT',
        'Persisted import preview row identity is inconsistent'
      );
    }
    if (candidate.status === 'needs_project_review') {
      const decision = decisionBySourceRow.get(sourceRowIndex);
      if (!decision) {
        throw new AppError(
          'CONFLICT',
          'Resolve every review row before committing the import'
        );
      }
      if (decision === 'import_uncoded') {
        if (excludedSourceRows.has(sourceRowIndex)) {
          throw new AppError(
            'VALIDATION_ERROR',
            'A review row cannot be both imported and excluded'
          );
        }
        rows.push({ row, importUncoded: true });
        importedReviewSourceRows.push(sourceRowIndex);
      } else {
        excludedSourceRows.add(sourceRowIndex);
      }
      continue;
    }
    if (
      candidate.status === 'excluded' ||
      candidate.status === 'invalid' ||
      excludedSourceRows.has(sourceRowIndex)
    ) {
      continue;
    }
    if (candidate.status === 'duplicate') {
      if (args.mode === 'append' && args.skipDuplicates) {
        previewDuplicateCount += 1;
        continue;
      }
      if (row.duplicateReason === 'import') {
        throw new AppError(
          'CONFLICT',
          'Duplicate rows inside the import file must be excluded before committing'
        );
      }
    }
    if (candidate.status !== 'ready' && candidate.status !== 'duplicate') {
      throw new AppError(
        'CONFLICT',
        'Import preview contains an invalid state'
      );
    }
    rows.push({ row, importUncoded: false });
  }

  return {
    rows,
    excludedSourceRows: [...excludedSourceRows],
    importedReviewSourceRows,
    previewDuplicateCount,
  };
}

async function resolveImportTaxonomy(args: {
  db: Transaction<DB>;
  companyId: CompanyId;
  projectId: ProjectId;
  rows: Array<{ row: ImportPreviewRow; importUncoded: boolean }>;
  autoCreateStructures: boolean;
}) {
  const [categories, subCategories] = await Promise.all([
    args.db
      .selectFrom('categories')
      .select(['id', 'name'])
      .where('project_id', '=', args.projectId)
      .execute(),
    args.db
      .selectFrom('sub_categories')
      .select(['id', 'category_id', 'name'])
      .where('project_id', '=', args.projectId)
      .execute(),
  ]);
  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );
  const categoryByName = new Map(
    categories.map((category) => [nameKey(category.name), category])
  );
  const subCategoryById = new Map(
    subCategories.map((subCategory) => [subCategory.id, subCategory])
  );
  const subCategoryByName = new Map(
    subCategories.map((subCategory) => [
      `${subCategory.category_id}|||${nameKey(subCategory.name)}`,
      subCategory,
    ])
  );
  const resolved = new Map<
    number,
    { categoryId?: CategoryId; subCategoryId?: SubCategoryId }
  >();

  for (const { row, importUncoded } of args.rows) {
    if (importUncoded || row.mappingStatus === 'uncoded') {
      resolved.set(row.sourceRowIndex, {});
      continue;
    }

    let category = row.categoryId
      ? categoryById.get(String(row.categoryId))
      : undefined;
    if (!category && row.categoryName) {
      category = categoryByName.get(nameKey(row.categoryName));
    }
    if (!category && row.willCreateCategory && row.categoryName) {
      if (!args.autoCreateStructures) {
        throw staleTaxonomyError();
      }
      const now = new Date().toISOString();
      await args.db
        .insertInto('categories')
        .values({
          id: asCategoryId(uid('cat')),
          company_id: args.companyId,
          project_id: args.projectId,
          name: row.categoryName.trim(),
          ...buildLocalProjectStandardMetadata(now),
          created_at: now,
          updated_at: now,
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
      category = await args.db
        .selectFrom('categories')
        .select(['id', 'name'])
        .where('project_id', '=', args.projectId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', nameKey(row.categoryName!))
        )
        .executeTakeFirst();
      if (category) {
        categoryById.set(category.id, category);
        categoryByName.set(nameKey(category.name), category);
      }
    }

    let subCategory = row.subCategoryId
      ? subCategoryById.get(String(row.subCategoryId))
      : undefined;
    if (!subCategory && category && row.subCategoryName) {
      subCategory = subCategoryByName.get(
        `${category.id}|||${nameKey(row.subCategoryName)}`
      );
    }
    if (
      !subCategory &&
      row.willCreateSubCategory &&
      row.subCategoryName &&
      category
    ) {
      if (!args.autoCreateStructures) {
        throw staleTaxonomyError();
      }
      const now = new Date().toISOString();
      await args.db
        .insertInto('sub_categories')
        .values({
          id: asSubCategoryId(uid('sub')),
          company_id: args.companyId,
          project_id: args.projectId,
          category_id: category.id,
          name: row.subCategoryName.trim(),
          ...buildLocalProjectStandardMetadata(now),
          created_at: now,
          updated_at: now,
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
      subCategory = await args.db
        .selectFrom('sub_categories')
        .select(['id', 'category_id', 'name'])
        .where('project_id', '=', args.projectId)
        .where('category_id', '=', category.id)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', nameKey(row.subCategoryName!))
        )
        .executeTakeFirst();
      if (subCategory) {
        subCategoryById.set(subCategory.id, subCategory);
        subCategoryByName.set(
          `${subCategory.category_id}|||${nameKey(subCategory.name)}`,
          subCategory
        );
      }
    }

    if (subCategory) {
      if (category && category.id !== subCategory.category_id) {
        throw staleTaxonomyError();
      }
      category = categoryById.get(subCategory.category_id);
    }
    if (!category || (row.subCategoryName && !subCategory)) {
      throw staleTaxonomyError();
    }
    resolved.set(
      row.sourceRowIndex,
      omitUndefinedProperties({
        categoryId: asCategoryId(category.id),
        subCategoryId: subCategory
          ? asSubCategoryId(subCategory.id)
          : undefined,
      })
    );
  }

  return resolved;
}

function transactionFromPreviewRow(args: {
  row: ImportPreviewRow;
  importUncoded: boolean;
  companyId: CompanyId;
  projectId: ProjectId;
  importBatchId: ImportBatchId;
  taxonomy: Map<
    number,
    { categoryId?: CategoryId; subCategoryId?: SubCategoryId }
  >;
}): Txn {
  const target = args.taxonomy.get(args.row.sourceRowIndex) ?? {};
  const txn = withStandardTxnAccountingMetadata(
    omitUndefinedProperties({
      id: asTxnId(args.row.importId),
      externalId: normalizeExternalId(args.row.externalId),
      companyId: args.companyId,
      projectId: args.projectId,
      date: args.row.parsedDate ?? '',
      item: args.row.item ?? '',
      description: args.row.description ?? '',
      amountCents: args.row.amountCents ?? 0,
      categoryId: args.importUncoded ? undefined : target.categoryId,
      subCategoryId: args.importUncoded ? undefined : target.subCategoryId,
      companyDefaultMappingRuleId: args.importUncoded
        ? undefined
        : args.row.ruleId,
      codingSource: args.importUncoded ? undefined : args.row.codingSource,
      codingPendingApproval: args.importUncoded
        ? false
        : args.row.codingPendingApproval,
      importBatchId: args.importBatchId,
      importSourceType: args.row.sourceType,
      importSourceMeta: args.row.rawSourceRow,
    })
  );
  validateOrThrow(txnInputSchema, txn);
  return txn;
}

async function replacementTransactionIds(args: {
  db: Transaction<DB>;
  projectId: ProjectId;
  sourceType: NonNullable<Txn['importSourceType']>;
  fromDate: string | null;
  toDate: string | null;
}): Promise<string[]> {
  if (!args.fromDate || !args.toDate) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A period replacement must contain at least one importable transaction'
    );
  }
  const targets = await args.db
    .selectFrom('txns')
    .select(['public_id', 'txn_type', 'reviewed_at', 'locked_at'])
    .where('project_id', '=', args.projectId)
    .where('import_source_type', '=', args.sourceType)
    .where('txn_date', '>=', args.fromDate)
    .where('txn_date', '<=', args.toDate)
    .orderBy('public_id', 'asc')
    .forUpdate()
    .execute();
  if (!targets.length) return [];

  const targetIds = targets.map((txn) => txn.public_id);
  const [comment, reversal, dependent, structuralLink] = await Promise.all([
    args.db
      .selectFrom('txn_comments')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('txn_public_id', 'in', targetIds)
      .executeTakeFirst(),
    args.db
      .selectFrom('txn_reversals')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where(({ eb, or }) =>
        or([
          eb('source_txn_public_id', 'in', targetIds),
          eb('matched_reversal_txn_public_id', 'in', targetIds),
        ])
      )
      .executeTakeFirst(),
    args.db
      .selectFrom('txns')
      .select('public_id')
      .where('project_id', '=', args.projectId)
      .where(({ eb, or }) =>
        or([
          eb('parent_public_id', 'in', targetIds),
          eb('source_public_id', 'in', targetIds),
        ])
      )
      .executeTakeFirst(),
    args.db
      .selectFrom('txn_links')
      .select('id')
      .where(({ eb, or, and }) =>
        or([
          and([
            eb('source_project_id', '=', args.projectId),
            eb('source_txn_public_id', 'in', targetIds),
          ]),
          and([
            eb('target_project_id', '=', args.projectId),
            eb('target_txn_public_id', 'in', targetIds),
          ]),
        ])
      )
      .executeTakeFirst(),
  ]);
  const hasProtectedState = targets.some(
    (txn) => txn.txn_type !== 'standard' || txn.reviewed_at || txn.locked_at
  );
  if (hasProtectedState || comment || reversal || dependent || structuralLink) {
    throw new AppError(
      'CONFLICT',
      'The selected import period contains reviewed, locked, commented, reversal-linked, or structurally related transactions. Use append or explicitly remove that protected history first.'
    );
  }
  return targetIds;
}

async function loadExistingTransactionKeys(args: {
  db: Transaction<DB>;
  projectId: ProjectId;
  excludingIds: string[];
}) {
  let query = args.db
    .selectFrom('txns')
    .select(['public_id', 'external_id'])
    .where('project_id', '=', args.projectId);
  if (args.excludingIds.length) {
    query = query.where('public_id', 'not in', args.excludingIds);
  }
  return (await query.execute()).map((txn) =>
    omitUndefinedProperties({
      id: asTxnId(txn.public_id),
      externalId: normalizeExternalId(txn.external_id),
    })
  );
}

function applyCommitDuplicatePolicy(args: {
  existingTransactions: Array<{ id: TxnId; externalId?: string }>;
  incomingTransactions: Txn[];
  skipDuplicates: boolean;
}) {
  const accepted = [...args.existingTransactions];
  const transactions: Txn[] = [];
  let skipped = 0;
  for (const txn of args.incomingTransactions) {
    try {
      assertUniqueTransactionKeysInProject([...accepted, txn]);
      accepted.push(txn);
      transactions.push(txn);
    } catch (error) {
      if (!args.skipDuplicates) throw error;
      skipped += 1;
    }
  }
  return { transactions, skipped };
}

async function finalizePreviewBatch(args: {
  db: Transaction<DB>;
  importBatchId: ImportBatchId;
  importedSourceRows: number[];
  excludedSourceRows: number[];
  importedReviewSourceRows: number[];
  userId: UserId;
  now: string;
}) {
  if (args.importedSourceRows.length) {
    await args.db
      .updateTable('import_candidates')
      .set((eb) => ({
        status: 'imported',
        txn_public_id: eb.ref('preview_import_id'),
        updated_at: args.now,
      }))
      .where('batch_id', '=', args.importBatchId)
      .where('source_row_index', 'in', args.importedSourceRows)
      .execute();
  }
  if (args.excludedSourceRows.length) {
    await args.db
      .updateTable('import_candidates')
      .set({
        status: 'excluded',
        reviewed_by_user_id: args.userId,
        reviewed_at: args.now,
        updated_at: args.now,
      })
      .where('batch_id', '=', args.importBatchId)
      .where('source_row_index', 'in', args.excludedSourceRows)
      .where('status', '!=', 'imported')
      .execute();
  }
  if (args.importedReviewSourceRows.length) {
    await args.db
      .updateTable('import_candidates')
      .set({
        reviewed_by_user_id: args.userId,
        reviewed_at: args.now,
        updated_at: args.now,
      })
      .where('batch_id', '=', args.importBatchId)
      .where('source_row_index', 'in', args.importedReviewSourceRows)
      .where('status', '=', 'imported')
      .execute();
  }
  await args.db
    .updateTable('import_batches')
    .set({ status: 'imported', updated_at: args.now })
    .where('id', '=', args.importBatchId)
    .where('status', '=', 'previewed')
    .executeTakeFirstOrThrow();
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

function toDateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === 'string'
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function staleTaxonomyError() {
  return new AppError(
    'CONFLICT',
    'Import coding targets changed after preview. Cancel it and create a new preview.'
  );
}
