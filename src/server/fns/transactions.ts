import { sql, type RawBuilder, type SelectQueryBuilder } from 'kysely';
import type {
  ImportBatchId,
  ImportCandidate,
  ImportCandidateId,
  ImportCandidateStatus,
  ImportPreviewRow,
  ProjectId,
  Txn,
  TxnId,
} from '../../types';
import {
  asBudgetLineId,
  asCompanyId,
  asImportBatchId,
  asImportCandidateId,
  asImportRuleId,
  asProjectId,
  asTxnId,
  asUserId,
} from '../../types';
import { AppError } from '../../api/errors';
import type {
  TxnCreateInput,
  TxnImportTxnInput,
  TxnListPageInput,
  TxnListPageResult,
  TxnSplitInput,
  TxnSplitResult,
  TxnTransferInput,
  TxnTransferResult,
  TxnUpdateInput,
  TxnWorkflowStateInput,
} from '../../api/types';
import { uid } from '../../utils/id';
import { txnInputSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { isAuthorized, requireAuthorized } from '../auth/authorize';
import { planImportPreview } from '../../utils/importPreviewPlan';
import { planTransactionImportCommit } from '../../utils/transactionImportCommitPlan';
import { planTransactionSplit } from '../../utils/transactionSplitPlan';
import { planTransactionTransfer } from '../../utils/transactionTransferPlan';
import { planTxnWorkflowState } from '../../utils/transactionWorkflow';
import {
  powerBiAmountCents,
  powerBiDescription,
  powerBiExternalId,
  powerBiItem,
  powerBiTransactionDate,
  toPowerBiExpenditureActualsRow,
} from '../../utils/powerBiImport';
import {
  assertTxnCodingAllowed,
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  normalizeTxnPatch,
  withStandardTxnAccountingMetadata,
} from '../../utils/transactions';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireOperationalProjectForAction,
  type ProjectActionContext,
} from './resourceGuards';
import { toTxn } from '../mappers/transactionRows';
import {
  loadTransactionImportCommitContext,
  loadTransactionImportPreviewContext,
} from '../loaders/importContext';
import { enforceRateLimit } from '../rateLimit';
import type { DB, TxnTable } from '../db/schema';

const IMPORT_PREVIEW_RATE_LIMIT = {
  limit: 12,
  windowMs: 10 * 60 * 1000,
} as const;

const IMPORT_COMMIT_RATE_LIMIT = {
  limit: 8,
  windowMs: 10 * 60 * 1000,
} as const;

const IMPORT_REVIEW_RATE_LIMIT = {
  limit: 30,
  windowMs: 10 * 60 * 1000,
} as const;

type TxnAliasDb = DB & { t: TxnTable };

type TxnPageSummaryRow = {
  total_count: number | string;
  budget_impact_cents: number | string;
  uncoded_count: number | string;
  uncoded_cents: number | string;
  source_only_count: number | string;
  assigned_to_me_count: number | string;
  reviewed_count: number | string;
  locked_count: number | string;
};

function txnValidSubCategorySql() {
  return sql<boolean>`exists (
    select 1
    from sub_categories sc
    where sc.id = t.sub_category_id
      and sc.project_id = t.project_id
  )`;
}

function txnAssignedToUserSql(userId: string) {
  return sql<boolean>`exists (
    select 1
    from txn_comments tc
    where tc.project_id = t.project_id
      and tc.txn_public_id = t.public_id
      and tc.assigned_to_user_id = ${userId}
      and tc.resolved_at is null
  )`;
}

function quarterFilterNumber(value: TxnListPageInput['quarterFilter']) {
  if (value === 'Q1') return 1;
  if (value === 'Q2') return 2;
  if (value === 'Q3') return 3;
  if (value === 'Q4') return 4;
  return null;
}

function buildTransactionsPageFilters(args: {
  projectId: ProjectId;
  userId: string;
  input: TxnListPageInput;
}): RawBuilder<boolean>[] {
  const filters: RawBuilder<boolean>[] = [
    sql<boolean>`t.project_id = ${args.projectId}`,
  ];
  const validSubCategory = txnValidSubCategorySql();
  const assignedToUser = txnAssignedToUserSql(args.userId);

  if (args.input.monthFilterKey) {
    filters.push(
      sql<boolean>`to_char(t.txn_date, 'YYYY-MM') = ${args.input.monthFilterKey}`
    );
  } else {
    if (args.input.yearFilter) {
      filters.push(
        sql<boolean>`extract(year from t.txn_date) = ${Number(args.input.yearFilter)}`
      );
    }
    const quarterNumber = quarterFilterNumber(args.input.quarterFilter);
    if (quarterNumber) {
      filters.push(
        sql<boolean>`extract(quarter from t.txn_date) = ${quarterNumber}`
      );
    }
  }

  if (args.input.transactionView === 'uncoded') {
    filters.push(
      sql<boolean>`t.categorisable and (t.sub_category_id is null or not (${validSubCategory}))`
    );
  }

  if (args.input.transactionView === 'auto-mapped-pending') {
    filters.push(
      sql<boolean>`t.categorisable and t.coding_pending_approval and t.sub_category_id is not null and ${validSubCategory}`
    );
  }

  if (args.input.transactionView === 'assigned-to-me') {
    filters.push(assignedToUser);
  }

  if (args.input.drilldown?.kind === 'category') {
    filters.push(
      sql<boolean>`t.budget_impact and t.categorisable and ${validSubCategory} and t.category_id = ${args.input.drilldown.categoryId}`
    );
  }

  if (args.input.drilldown?.kind === 'subcategory') {
    filters.push(
      sql<boolean>`t.budget_impact and t.categorisable and ${validSubCategory} and t.category_id = ${args.input.drilldown.categoryId} and t.sub_category_id = ${args.input.drilldown.subCategoryId}`
    );
  }

  return filters;
}

function applyTxnPageFilters<O>(
  query: SelectQueryBuilder<TxnAliasDb, 't', O>,
  filters: RawBuilder<boolean>[]
): SelectQueryBuilder<TxnAliasDb, 't', O> {
  let next = query;
  for (const filter of filters) {
    next = next.where(filter);
  }
  return next;
}

function toCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function assertTxnUnlocked(txn: Txn): void {
  if (txn.lockedAt) {
    throw new AppError(
      'CONFLICT',
      'Transaction is locked and cannot be changed'
    );
  }
}

async function assertTransactionResourceOwnership(
  context: ProjectActionContext,
  txn: Txn
): Promise<void> {
  assertTxnCodingAllowed(txn);

  if (txn.subCategoryId && !txn.categoryId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Category is required when subcategory is set'
    );
  }

  if (txn.categoryId) {
    await assertCategoryInProject({
      db: context.db,
      projectId: context.projectId,
      categoryId: txn.categoryId,
    });
  }

  if (txn.subCategoryId) {
    await assertSubCategoryInProject({
      db: context.db,
      projectId: context.projectId,
      subCategoryId: txn.subCategoryId,
      categoryId: txn.categoryId,
    });
  }

  if (txn.companyDefaultMappingRuleId) {
    await assertCompanyDefaultMappingRuleInCompany({
      db: context.db,
      companyId: context.companyId,
      ruleId: txn.companyDefaultMappingRuleId,
    });
  }
}

export async function listTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Txn[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    const rows = await db
      .selectFrom('txns')
      .select([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'import_batch_id',
        'import_source_type',
        'import_source_meta',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(toTxn);
  });
}

export async function listTransactionsPageServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnListPageInput;
}): Promise<TxnListPageResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    const { db, userId } = context;
    const sort = args.input.sort ?? {
      field: 'date' as const,
      direction: 'desc' as const,
    };
    const offset = args.input.pageIndex * args.input.pageSize;
    const filters = buildTransactionsPageFilters({
      projectId: args.projectId,
      userId,
      input: args.input,
    });

    let rowsQuery = applyTxnPageFilters(
      db
        .selectFrom('txns as t')
        .select([
          't.id',
          't.public_id',
          't.external_id',
          't.company_id',
          't.project_id',
          't.txn_date',
          't.item',
          't.description',
          't.amount_cents',
          't.txn_type',
          't.parent_public_id',
          't.source_public_id',
          't.transfer_project_id',
          't.budget_impact',
          't.categorisable',
          't.import_batch_id',
          't.import_source_type',
          't.import_source_meta',
          't.category_id',
          't.sub_category_id',
          't.company_default_mapping_rule_id',
          't.coding_source',
          't.coding_pending_approval',
          't.reviewed_at',
          't.reviewed_by_user_id',
          't.locked_at',
          't.locked_by_user_id',
          't.created_at',
          't.updated_at',
        ]),
      filters
    );

    if (sort.field === 'transaction') {
      rowsQuery = rowsQuery
        .orderBy('t.item', sort.direction)
        .orderBy('t.description', sort.direction)
        .orderBy('t.id', 'desc');
    } else if (sort.field === 'amountCents') {
      rowsQuery = rowsQuery
        .orderBy('t.amount_cents', sort.direction)
        .orderBy('t.txn_date', 'desc')
        .orderBy('t.id', 'desc');
    } else {
      rowsQuery = rowsQuery
        .orderBy('t.txn_date', sort.direction)
        .orderBy('t.id', sort.direction);
    }

    const [rows, summaryRow] = await Promise.all([
      rowsQuery.limit(args.input.pageSize).offset(offset).execute(),
      (() => {
        const summaryQuery = applyTxnPageFilters(
          db.selectFrom('txns as t').select(() => {
            const validSubCategory = txnValidSubCategorySql();
            const assignedToUser = txnAssignedToUserSql(userId);
            return [
              sql<number>`count(*)`.as('total_count'),
              sql<number>`coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0)`.as(
                'budget_impact_cents'
              ),
              sql<number>`coalesce(sum(case when t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then 1 else 0 end), 0)`.as(
                'uncoded_count'
              ),
              sql<number>`coalesce(sum(case when t.budget_impact and t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then t.amount_cents else 0 end), 0)`.as(
                'uncoded_cents'
              ),
              sql<number>`coalesce(sum(case when (not t.budget_impact) or (not t.categorisable) then 1 else 0 end), 0)`.as(
                'source_only_count'
              ),
              sql<number>`coalesce(sum(case when ${assignedToUser} then 1 else 0 end), 0)`.as(
                'assigned_to_me_count'
              ),
              sql<number>`coalesce(sum(case when t.reviewed_at is not null then 1 else 0 end), 0)`.as(
                'reviewed_count'
              ),
              sql<number>`coalesce(sum(case when t.locked_at is not null then 1 else 0 end), 0)`.as(
                'locked_count'
              ),
            ];
          }),
          filters
        );
        return summaryQuery.executeTakeFirstOrThrow();
      })(),
    ]);

    return {
      rows: rows.map(toTxn),
      summary: {
        totalCount: toCount((summaryRow as TxnPageSummaryRow).total_count),
        budgetImpactCents: toCount(
          (summaryRow as TxnPageSummaryRow).budget_impact_cents
        ),
        uncodedCount: toCount((summaryRow as TxnPageSummaryRow).uncoded_count),
        uncodedCents: toCount((summaryRow as TxnPageSummaryRow).uncoded_cents),
        sourceOnlyCount: toCount(
          (summaryRow as TxnPageSummaryRow).source_only_count
        ),
        assignedToMeCount: toCount(
          (summaryRow as TxnPageSummaryRow).assigned_to_me_count
        ),
        reviewedCount: toCount(
          (summaryRow as TxnPageSummaryRow).reviewed_count
        ),
        lockedCount: toCount((summaryRow as TxnPageSummaryRow).locked_count),
        invalidDateCount: 0,
      },
    };
  });
}

export async function createTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnCreateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db } = context;

    if (args.input.projectId !== args.projectId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId does not match target project'
      );
    }
    if (args.input.companyId !== context.companyId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction companyId does not match project company'
      );
    }

    validateOrThrow(txnInputSchema, args.input);

    const next: Txn = withStandardTxnAccountingMetadata({
      ...args.input,
      id: args.input.id ?? asTxnId(uid('txn')),
      externalId: normalizeExternalId(args.input.externalId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assertTransactionResourceOwnership(context, next);

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const existingForCheck = existingRows.map((r) => ({
      id: asTxnId(r.public_id),
      externalId: normalizeExternalId(r.external_id),
    }));
    assertUniqueTransactionKeysInProject([...existingForCheck, next]);

    const row = await db
      .insertInto('txns')
      .values({
        public_id: next.id,
        external_id: next.externalId ?? null,
        company_id: next.companyId,
        project_id: next.projectId,
        txn_date: next.date,
        item: next.item,
        description: next.description,
        amount_cents: next.amountCents,
        txn_type: next.txnType,
        parent_public_id: next.parentTxnId ?? null,
        source_public_id: next.sourceTxnId ?? null,
        transfer_project_id: next.transferProjectId ?? null,
        budget_impact: next.budgetImpact,
        categorisable: next.categorisable,
        import_batch_id: next.importBatchId ?? null,
        import_source_type: next.importSourceType ?? null,
        import_source_meta: next.importSourceMeta ?? null,
        category_id: next.categoryId ?? null,
        sub_category_id: next.subCategoryId ?? null,
        company_default_mapping_rule_id:
          next.companyDefaultMappingRuleId ?? null,
        coding_source: next.codingSource ?? null,
        coding_pending_approval: !!next.codingPendingApproval,
        created_at: next.createdAt,
        updated_at: next.updatedAt,
      })
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'import_batch_id',
        'import_source_type',
        'import_source_meta',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(row);
  });
}

export async function updateTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUpdateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db } = context;

    const existing = await db
      .selectFrom('txns')
      .select([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    if (
      typeof args.input.projectId !== 'undefined' &&
      args.input.projectId !== asProjectId(existing.project_id)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId cannot be changed'
      );
    }
    if (
      typeof args.input.companyId !== 'undefined' &&
      args.input.companyId !== asCompanyId(existing.company_id)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction companyId cannot be changed'
      );
    }

    const prev = toTxn(existing);
    assertTxnUnlocked(prev);
    const normalizedInput = normalizeTxnPatch(args.input);
    if (
      (prev.txnType === 'split_parent' ||
        prev.txnType === 'transfer_source' ||
        prev.txnType === 'transfer_child') &&
      typeof normalizedInput.amountCents !== 'undefined' &&
      normalizedInput.amountCents !== prev.amountCents
    ) {
      throw new AppError(
        'CONFLICT',
        prev.txnType === 'split_parent'
          ? 'Split parent amount cannot be edited directly. Update the split children instead.'
          : prev.txnType === 'transfer_source'
            ? 'Transferred-out source amount cannot be edited directly. Update the transfer destination instead.'
            : 'Transferred-in amount cannot be edited directly. Split it if you need to reallocate it.'
      );
    }
    const nextExternalId = Object.prototype.hasOwnProperty.call(
      normalizedInput,
      'externalId'
    )
      ? normalizeExternalId(normalizedInput.externalId ?? undefined)
      : normalizeExternalId(prev.externalId);
    const now = new Date().toISOString();
    const next: Txn = {
      ...prev,
      ...normalizedInput,
      externalId: nextExternalId,
      updatedAt: now,
    };

    validateOrThrow(txnInputSchema, next);
    await assertTransactionResourceOwnership(context, next);

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const forCheck = existingRows.map((r) => ({
      id: asTxnId(r.public_id),
      externalId: normalizeExternalId(r.external_id),
    }));
    const idx = forCheck.findIndex((r) => r.id === next.id);
    if (idx >= 0) forCheck[idx] = { id: next.id, externalId: next.externalId };
    assertUniqueTransactionKeysInProject(forCheck);

    const patch = {
      external_id: nextExternalId ?? null,
      item: next.item,
      description: next.description,
      amount_cents: next.amountCents,
      category_id: next.categoryId ?? null,
      sub_category_id: next.subCategoryId ?? null,
      company_default_mapping_rule_id: next.companyDefaultMappingRuleId ?? null,
      coding_source: next.codingSource ?? null,
      coding_pending_approval: !!next.codingPendingApproval,
      created_at: prev.createdAt,
      updated_at: now,
      ...(typeof args.input.date !== 'undefined'
        ? { txn_date: next.date }
        : {}),
    };

    const updated = await db
      .updateTable('txns')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(updated);
  });
}

export async function deleteTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const existing = await db
      .selectFrom('txns')
      .select('locked_at')
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');
    if (existing.locked_at) {
      throw new AppError(
        'CONFLICT',
        'Transaction is locked and cannot be deleted'
      );
    }
    await db
      .deleteFrom('txns')
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.txnId)
      .execute();
  });
}

export async function splitTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnSplitInput;
}): Promise<TxnSplitResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db } = context;

    const existing = await db
      .selectFrom('txns')
      .select([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    const parentTxn = toTxn(existing);
    assertTxnUnlocked(parentTxn);
    const now = new Date().toISOString();
    const split = planTransactionSplit({
      parent: parentTxn,
      children: args.input.children,
      now,
      createTxnId: () => asTxnId(uid('txn')),
    });

    for (const child of split.children) {
      validateOrThrow(txnInputSchema, child);
      await assertTransactionResourceOwnership(context, child);
    }

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    assertUniqueTransactionKeysInProject([
      ...existingRows.map((row) => ({
        id: asTxnId(row.public_id),
        externalId: normalizeExternalId(row.external_id),
      })),
      ...split.children,
    ]);

    const result = await db.transaction().execute(async (trx) => {
      const parent = await trx
        .updateTable('txns')
        .set({
          txn_type: split.parent.txnType,
          parent_public_id: split.parent.parentTxnId ?? null,
          source_public_id: split.parent.sourceTxnId ?? null,
          transfer_project_id: split.parent.transferProjectId ?? null,
          budget_impact: split.parent.budgetImpact,
          categorisable: split.parent.categorisable,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .where('txn_type', 'in', ['standard', 'transfer_child'])
        .where('budget_impact', '=', true)
        .where('categorisable', '=', true)
        .where('locked_at', 'is', null)
        .returning([
          'id',
          'public_id',
          'external_id',
          'company_id',
          'project_id',
          'txn_date',
          'item',
          'description',
          'amount_cents',
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirst();

      if (!parent) {
        throw new AppError(
          'CONFLICT',
          'Transaction was already split or changed'
        );
      }

      const children = await trx
        .insertInto('txns')
        .values(
          split.children.map((child) => ({
            public_id: child.id,
            external_id: null,
            company_id: child.companyId,
            project_id: child.projectId,
            txn_date: child.date,
            item: child.item,
            description: child.description,
            amount_cents: child.amountCents,
            txn_type: child.txnType,
            parent_public_id: child.parentTxnId ?? null,
            source_public_id: child.sourceTxnId ?? null,
            transfer_project_id: child.transferProjectId ?? null,
            budget_impact: child.budgetImpact,
            categorisable: child.categorisable,
            category_id: child.categoryId ?? null,
            sub_category_id: child.subCategoryId ?? null,
            company_default_mapping_rule_id: null,
            coding_source: child.codingSource ?? null,
            coding_pending_approval: false,
            created_at: now,
            updated_at: now,
          }))
        )
        .returning([
          'id',
          'public_id',
          'external_id',
          'company_id',
          'project_id',
          'txn_date',
          'item',
          'description',
          'amount_cents',
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .execute();

      return { parent: toTxn(parent), children: children.map(toTxn) };
    });

    return result;
  });
}

export async function transferTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnTransferInput;
}): Promise<TxnTransferResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const sourceContext = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    if (!sourceContext.allowTxnTransfers) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction transfers are not enabled for this project'
      );
    }
    const destinationContext = await requireOperationalProjectForAction(
      args.context,
      args.input.destinationProjectId,
      'txns:edit',
      sourceContext.db
    );
    const { db } = sourceContext;

    if (sourceContext.companyId !== destinationContext.companyId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transactions can only be moved within the same company'
      );
    }

    const existing = await db
      .selectFrom('txns')
      .select([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    const sourceTxn = toTxn(existing);
    assertTxnUnlocked(sourceTxn);
    const now = new Date().toISOString();
    const transfer = planTransactionTransfer({
      source: sourceTxn,
      input: args.input,
      destinationCompanyId: destinationContext.companyId,
      now,
      createTxnId: () => asTxnId(uid('txn')),
    });

    validateOrThrow(txnInputSchema, transfer.destination);
    await assertTransactionResourceOwnership(
      destinationContext,
      transfer.destination
    );

    const destinationRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.input.destinationProjectId)
      .execute();
    assertUniqueTransactionKeysInProject([
      ...destinationRows.map((row) => ({
        id: asTxnId(row.public_id),
        externalId: normalizeExternalId(row.external_id),
      })),
      transfer.destination,
    ]);

    const result = await db.transaction().execute(async (trx) => {
      const source = await trx
        .updateTable('txns')
        .set({
          txn_type: transfer.source.txnType,
          parent_public_id: transfer.source.parentTxnId ?? null,
          source_public_id: transfer.source.sourceTxnId ?? null,
          transfer_project_id: transfer.source.transferProjectId ?? null,
          budget_impact: transfer.source.budgetImpact,
          categorisable: transfer.source.categorisable,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .where('txn_type', 'in', ['standard', 'split_child'])
        .where('budget_impact', '=', true)
        .where('categorisable', '=', true)
        .where('locked_at', 'is', null)
        .returning([
          'id',
          'public_id',
          'external_id',
          'company_id',
          'project_id',
          'txn_date',
          'item',
          'description',
          'amount_cents',
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirst();

      if (!source) {
        throw new AppError(
          'CONFLICT',
          'Transaction was already moved, split, or changed'
        );
      }

      const destination = await trx
        .insertInto('txns')
        .values({
          public_id: transfer.destination.id,
          external_id: null,
          company_id: transfer.destination.companyId,
          project_id: transfer.destination.projectId,
          txn_date: transfer.destination.date,
          item: transfer.destination.item,
          description: transfer.destination.description,
          amount_cents: transfer.destination.amountCents,
          txn_type: transfer.destination.txnType,
          parent_public_id: null,
          source_public_id: transfer.destination.sourceTxnId ?? null,
          transfer_project_id: transfer.destination.transferProjectId ?? null,
          budget_impact: transfer.destination.budgetImpact,
          categorisable: transfer.destination.categorisable,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          created_at: now,
          updated_at: now,
        })
        .returning([
          'id',
          'public_id',
          'external_id',
          'company_id',
          'project_id',
          'txn_date',
          'item',
          'description',
          'amount_cents',
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirstOrThrow();

      return { source: toTxn(source), destination: toTxn(destination) };
    });

    return result;
  });
}

export async function updateTxnWorkflowStateServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnWorkflowStateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const now = new Date().toISOString();

    const existing = await context.db
      .selectFrom('txns')
      .select([
        'public_id',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    const patch = {
      ...planTxnWorkflowState({
        current: {
          reviewedAt: existing.reviewed_at ?? undefined,
          reviewedByUserId: existing.reviewed_by_user_id
            ? asUserId(existing.reviewed_by_user_id)
            : undefined,
          lockedAt: existing.locked_at ?? undefined,
          lockedByUserId: existing.locked_by_user_id
            ? asUserId(existing.locked_by_user_id)
            : undefined,
        },
        reviewed: args.input.reviewed,
        locked: args.input.locked,
        actorUserId: context.userId,
        now,
      }),
      updated_at: now,
    };

    const updated = await context.db
      .updateTable('txns')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(updated);
  });
}

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
      defaultCategories: importContext.defaultCategories,
      defaultSubCategories: importContext.defaultSubCategories,
      mappingRules: importContext.mappingRules,
      projectCategories: importContext.projectCategories,
      projectSubCategories: importContext.projectSubCategories,
      mode: args.mode,
      autoCreateBudgets: Boolean(args.autoCreateBudgets),
    });

    if (args.mode === 'replaceAll') {
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
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
        if (!plan.importedTransactions.length) return;
        await trx
          .insertInto('txns')
          .values(
            plan.importedTransactions.map((t) => ({
              public_id: t.id,
              external_id: t.externalId ?? null,
              company_id: t.companyId,
              project_id: t.projectId,
              txn_date: t.date,
              item: t.item,
              description: t.description,
              amount_cents: t.amountCents,
              txn_type: 'standard',
              parent_public_id: null,
              source_public_id: null,
              transfer_project_id: null,
              budget_impact: true,
              categorisable: true,
              import_batch_id: t.importBatchId ?? null,
              import_source_type: t.importSourceType ?? null,
              import_source_meta: t.importSourceMeta ?? null,
              category_id: t.categoryId ?? null,
              sub_category_id: t.subCategoryId ?? null,
              company_default_mapping_rule_id:
                t.companyDefaultMappingRuleId ?? null,
              coding_source: t.codingSource ?? null,
              coding_pending_approval: !!t.codingPendingApproval,
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
        await trx
          .insertInto('txns')
          .values(
            plan.importedTransactions.map((t) => ({
              public_id: t.id,
              external_id: t.externalId ?? null,
              company_id: t.companyId,
              project_id: t.projectId,
              txn_date: t.date,
              item: t.item,
              description: t.description,
              amount_cents: t.amountCents,
              txn_type: 'standard',
              parent_public_id: null,
              source_public_id: null,
              transfer_project_id: null,
              budget_impact: true,
              categorisable: true,
              import_batch_id: t.importBatchId ?? null,
              import_source_type: t.importSourceType ?? null,
              import_source_meta: t.importSourceMeta ?? null,
              category_id: t.categoryId ?? null,
              sub_category_id: t.subCategoryId ?? null,
              company_default_mapping_rule_id:
                t.companyDefaultMappingRuleId ?? null,
              coding_source: t.codingSource ?? null,
              coding_pending_approval: !!t.codingPendingApproval,
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
      defaultCategories: importContext.defaultCategories,
      defaultSubCategories: importContext.defaultSubCategories,
      mappingRules: importContext.mappingRules,
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

function importCandidateStatusForPreviewRow(
  row: ImportPreviewRow
): ImportCandidateStatus {
  if (row.importAction === 'exclude') return 'excluded';
  if (row.importAction === 'review') return 'needs_project_review';
  if (row.mappingStatus === 'invalid') return 'invalid';
  if (row.duplicate) return 'duplicate';
  return 'ready';
}

function persistedImportRuleId(row: ImportPreviewRow) {
  if (!row.importRuleId) return null;
  return String(row.importRuleId).startsWith('default_import_rule_')
    ? null
    : row.importRuleId;
}

type ImportCandidateRow = {
  id: string;
  company_id: string;
  project_id: string;
  batch_id: string;
  source_row_index: number;
  raw_row: Record<string, string>;
  status: ImportCandidateStatus;
  matched_import_rule_id: string | null;
  status_reason: string | null;
  txn_public_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

function importCandidateSelectColumns() {
  return [
    'id',
    'company_id',
    'project_id',
    'batch_id',
    'source_row_index',
    'raw_row',
    'status',
    'matched_import_rule_id',
    'status_reason',
    'txn_public_id',
    'reviewed_by_user_id',
    'reviewed_at',
    'created_at',
    'updated_at',
  ] as const;
}

function toImportCandidate(row: ImportCandidateRow): ImportCandidate {
  return {
    id: asImportCandidateId(row.id),
    companyId: asCompanyId(row.company_id),
    projectId: asProjectId(row.project_id),
    batchId: asImportBatchId(row.batch_id),
    sourceRowIndex: row.source_row_index,
    rawRow: row.raw_row,
    status: row.status,
    matchedImportRuleId: row.matched_import_rule_id
      ? asImportRuleId(row.matched_import_rule_id)
      : undefined,
    statusReason: row.status_reason ?? undefined,
    txnId: row.txn_public_id ? asTxnId(row.txn_public_id) : undefined,
    reviewedByUserId: row.reviewed_by_user_id
      ? asUserId(row.reviewed_by_user_id)
      : undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    return rows.map(toImportCandidate);
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
    if (!batch || !['partially_imported', 'imported'].includes(batch.status)) {
      throw new AppError(
        'CONFLICT',
        'Import preview must be committed before review candidates can be actioned'
      );
    }

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
      return { candidate: toImportCandidate(row) };
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
      defaultCategories: importContext.defaultCategories,
      defaultSubCategories: importContext.defaultSubCategories,
      mappingRules: importContext.mappingRules,
      projectCategories: importContext.projectCategories,
      projectSubCategories: importContext.projectSubCategories,
      mode: 'append',
      autoCreateBudgets: false,
    });
    const txn = planned.importedTransactions[0];
    if (!txn) throw new AppError('INTERNAL_ERROR', 'Import candidate failed');

    let insertedTxn: Txn | undefined;
    let updatedCandidate: ImportCandidate | undefined;
    await db.transaction().execute(async (trx) => {
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
        .returning([
          'id',
          'public_id',
          'external_id',
          'company_id',
          'project_id',
          'txn_date',
          'item',
          'description',
          'amount_cents',
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'import_batch_id',
          'import_source_type',
          'import_source_meta',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
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
      updatedCandidate = toImportCandidate(candidateRow);

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
