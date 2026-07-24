import { sql } from 'kysely';

import {
  asSubCategoryId,
  asTxnId,
  type ProjectId,
  type Txn,
} from '../../../types';
import type {
  ProjectTransactionSummary,
  TxnBulkSelectionResult,
  TxnListFilterInput,
  TxnListPageInput,
  TxnListPageResult,
} from '../../../api/types';
import { AppError } from '../../../api/errors';
import { MAX_BULK_TXN_COUNT } from '../../../utils/transactionLimits';
import { toTxn } from '../../mappers/transactionRows';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  applyTxnPageFilters,
  buildTransactionsPageFilters,
  OPEN_TXN_REVERSAL_STATUSES,
  prefixedTxnSelectColumns,
  toCount,
  txnAssignedToUserSql,
  reversalMatchReviewTxnSql,
  txnReversalJoin,
  txnReversalSelectExpressions,
  txnUnlockRequestJoin,
  txnUnlockRequestSelectExpressions,
  txnValidSubCategorySql,
  type ProjectTransactionSummaryAggregateRow,
  type ProjectTransactionPeriodSummaryRow,
  type TxnPageSummaryRow,
} from './shared';

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
      .selectFrom('txns as t')
      .leftJoin('txn_reversals as tr', txnReversalJoin())
      .leftJoin('txn_unlock_requests as tur', txnUnlockRequestJoin())
      .select([
        ...prefixedTxnSelectColumns('t'),
        ...txnReversalSelectExpressions({}),
        ...txnUnlockRequestSelectExpressions(),
      ])
      .where('t.project_id', '=', args.projectId)
      .orderBy('t.created_at', 'asc')
      .orderBy('t.id', 'asc')
      .execute();
    return rows.map(toTxn);
  });
}

export async function getTransactionServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: string;
}): Promise<Txn | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    const row = await db
      .selectFrom('txns as t')
      .leftJoin('txn_reversals as tr', txnReversalJoin())
      .leftJoin('txn_unlock_requests as tur', txnUnlockRequestJoin())
      .select([
        ...prefixedTxnSelectColumns('t'),
        ...txnReversalSelectExpressions({}),
        ...txnUnlockRequestSelectExpressions(),
      ])
      .where('t.project_id', '=', args.projectId)
      .where('t.public_id', '=', args.txnId)
      .executeTakeFirst();
    return row ? toTxn(row) : null;
  });
}

export async function listTransactionsSelectionServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnListFilterInput;
}): Promise<TxnBulkSelectionResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    const filters = buildTransactionsPageFilters({
      projectId: args.projectId,
      userId,
      input: args.input,
    });
    const sort = args.input.sort ?? {
      field: 'date' as const,
      direction: 'desc' as const,
    };
    let rowsQuery = applyTxnPageFilters(db.selectFrom('txns as t'), filters)
      .leftJoin('txn_reversals as tr', txnReversalJoin())
      .select([
        't.public_id',
        't.categorisable',
        't.sub_category_id',
        't.coding_pending_approval',
        't.locked_at',
        't.workflow_version',
        'tr.id as reversal_id',
        'tr.status as reversal_status',
        'tr.version as reversal_version',
        'tr.match_method as reversal_match_method',
        'tr.source_snapshot as reversal_source_snapshot',
        'tr.counterpart_snapshot as reversal_counterpart_snapshot',
        sql<'source' | 'reversal'>`
          case
            when tr.source_txn_public_id = t.public_id then 'source'
            else 'reversal'
          end
        `.as('reversal_side'),
      ]);
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
    const rows = await rowsQuery.limit(MAX_BULK_TXN_COUNT + 1).execute();

    if (rows.length > MAX_BULK_TXN_COUNT) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Select all supports up to ${MAX_BULK_TXN_COUNT.toLocaleString()} transactions. Narrow the workflow or date filters and try again.`
      );
    }

    return {
      rows: rows.map((row) => ({
        id: asTxnId(row.public_id),
        categorisable: row.categorisable,
        subCategoryId: row.sub_category_id
          ? asSubCategoryId(row.sub_category_id)
          : undefined,
        codingPendingApproval: row.coding_pending_approval,
        locked: Boolean(row.locked_at),
        workflowVersion: row.workflow_version,
        reversal: row.reversal_id
          ? {
              id: row.reversal_id,
              status: row.reversal_status!,
              side: row.reversal_side,
              version: row.reversal_version!,
              matchMethod: row.reversal_match_method ?? undefined,
              sourceTxn: row.reversal_source_snapshot ?? undefined,
              counterpartTxn: row.reversal_counterpart_snapshot ?? undefined,
            }
          : undefined,
      })),
    };
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
        .leftJoin('txn_reversals as tr', txnReversalJoin())
        .leftJoin('txn_unlock_requests as tur', txnUnlockRequestJoin())
        .select([
          ...prefixedTxnSelectColumns('t'),
          ...txnReversalSelectExpressions({}),
          ...txnUnlockRequestSelectExpressions(),
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
          db.selectFrom('txns as t'),
          filters
        )
          .leftJoin('sub_categories as summary_sc', (join) =>
            join
              .onRef('summary_sc.project_id', '=', 't.project_id')
              .onRef('summary_sc.id', '=', 't.sub_category_id')
          )
          .leftJoin('txn_reversals as summary_tr', (join) =>
            join
              .onRef('summary_tr.project_id', '=', 't.project_id')
              .onRef('summary_tr.source_txn_public_id', '=', 't.public_id')
              .on('summary_tr.status', 'in', OPEN_TXN_REVERSAL_STATUSES)
          )
          .select(() => {
            // Both joins are unique in project scope, so they cannot multiply txns.
            const validSubCategory = sql<boolean>`summary_sc.id is not null`;
            const assignedToUser = txnAssignedToUserSql(userId);
            const pendingReversal = sql<boolean>`summary_tr.id is not null`;
            const unrecordedPendingReversal = sql<boolean>`summary_tr.id is not null and summary_tr.matched_reversal_txn_public_id is null`;
            const codingApproval = sql<boolean>`t.categorisable and t.coding_pending_approval and t.sub_category_id is not null and ${validSubCategory}`;
            const reversalReview = sql<boolean>`summary_tr.status in ('auto_matched_pending_approval', 'auto_matched_ambiguous_pending_approval', 'reversal_exception')`;
            const reversalMatchReview = reversalMatchReviewTxnSql();
            const awaitingReversal = sql<boolean>`summary_tr.status = 'pending_reversal'`;
            return [
              sql<number>`count(*)`.as('total_count'),
              sql<number>`coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0)`.as(
                'budget_impact_cents'
              ),
              sql<number>`coalesce(sum(case when ${pendingReversal} then 1 else 0 end), 0)`.as(
                'pending_reversal_count'
              ),
              sql<number>`coalesce(sum(case when ${unrecordedPendingReversal} then t.amount_cents else 0 end), 0)`.as(
                'pending_reversal_cents'
              ),
              sql<number>`coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0) - coalesce(sum(case when ${unrecordedPendingReversal} then t.amount_cents else 0 end), 0)`.as(
                'adjusted_budget_impact_cents'
              ),
              sql<number>`coalesce(sum(case when t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then 1 else 0 end), 0)`.as(
                'uncoded_count'
              ),
              sql<number>`coalesce(sum(case when t.budget_impact and t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then t.amount_cents else 0 end), 0)`.as(
                'uncoded_cents'
              ),
              sql<number>`coalesce(sum(case when ${codingApproval} then 1 else 0 end), 0)`.as(
                'coding_approval_count'
              ),
              sql<number>`coalesce(sum(case when ${reversalReview} then 1 else 0 end), 0)`.as(
                'reversal_review_count'
              ),
              sql<number>`coalesce(sum(case when ${reversalMatchReview} then 1 else 0 end), 0)`.as(
                'reversal_match_review_count'
              ),
              sql<number>`coalesce(sum(case when ${awaitingReversal} then 1 else 0 end), 0)`.as(
                'awaiting_reversal_count'
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
          });
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
        pendingReversalCount: toCount(
          (summaryRow as TxnPageSummaryRow).pending_reversal_count
        ),
        pendingReversalCents: toCount(
          (summaryRow as TxnPageSummaryRow).pending_reversal_cents
        ),
        adjustedBudgetImpactCents: toCount(
          (summaryRow as TxnPageSummaryRow).adjusted_budget_impact_cents
        ),
        uncodedCount: toCount((summaryRow as TxnPageSummaryRow).uncoded_count),
        uncodedCents: toCount((summaryRow as TxnPageSummaryRow).uncoded_cents),
        codingApprovalCount: toCount(
          (summaryRow as TxnPageSummaryRow).coding_approval_count
        ),
        reversalReviewCount: toCount(
          (summaryRow as TxnPageSummaryRow).reversal_review_count
        ),
        reversalMatchReviewCount: toCount(
          (summaryRow as TxnPageSummaryRow).reversal_match_review_count
        ),
        awaitingReversalCount: toCount(
          (summaryRow as TxnPageSummaryRow).awaiting_reversal_count
        ),
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

export async function listProjectTransactionSummaryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ProjectTransactionSummary> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    const validSubCategory = txnValidSubCategorySql();

    const [monthRows, actualRows, periodRows, uncodedRow] = await Promise.all([
      db
        .selectFrom('txns as t')
        .select([sql<string>`to_char(t.txn_date, 'YYYY-MM')`.as('month_key')])
        .where('t.project_id', '=', args.projectId)
        .where('t.budget_impact', '=', true)
        .groupBy(sql`to_char(t.txn_date, 'YYYY-MM')`)
        .orderBy('month_key', 'asc')
        .execute(),
      db
        .selectFrom('txns as t')
        .select([
          sql<string>`${sql.ref('t.sub_category_id')}`.as('sub_category_id'),
          sql<string>`to_char(t.txn_date, 'YYYY-MM')`.as('month_key'),
          sql<number>`coalesce(sum(t.amount_cents), 0)`.as('actual_cents'),
        ])
        .where('t.project_id', '=', args.projectId)
        .where('t.budget_impact', '=', true)
        .where('t.categorisable', '=', true)
        .where('t.sub_category_id', 'is not', null)
        .where(validSubCategory)
        .groupBy('t.sub_category_id')
        .groupBy(sql`to_char(t.txn_date, 'YYYY-MM')`)
        .orderBy('month_key', 'asc')
        .orderBy('t.sub_category_id', 'asc')
        .execute(),
      db
        .selectFrom('txns as t')
        .leftJoin('txn_reversals as period_tr', (join) =>
          join
            .onRef('period_tr.project_id', '=', 't.project_id')
            .onRef('period_tr.source_txn_public_id', '=', 't.public_id')
            .on('period_tr.status', 'in', OPEN_TXN_REVERSAL_STATUSES)
        )
        .select([
          sql<string>`to_char(t.txn_date, 'YYYY-MM')`.as('month_key'),
          sql<number>`coalesce(sum(case when t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then 1 else 0 end), 0)`.as(
            'uncoded_count'
          ),
          sql<number>`coalesce(sum(case when t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then t.amount_cents else 0 end), 0)`.as(
            'uncoded_cents'
          ),
          sql<number>`coalesce(sum(case when period_tr.id is not null then 1 else 0 end), 0)`.as(
            'pending_reversal_count'
          ),
          sql<number>`coalesce(sum(case when period_tr.id is not null and period_tr.matched_reversal_txn_public_id is null then t.amount_cents else 0 end), 0)`.as(
            'pending_reversal_cents'
          ),
        ])
        .where('t.project_id', '=', args.projectId)
        .where('t.budget_impact', '=', true)
        .groupBy(sql`to_char(t.txn_date, 'YYYY-MM')`)
        .orderBy('month_key', 'asc')
        .execute() as Promise<ProjectTransactionPeriodSummaryRow[]>,
      db
        .selectFrom('txns as t')
        .leftJoin('txn_reversals as summary_tr', (join) =>
          join
            .onRef('summary_tr.project_id', '=', 't.project_id')
            .onRef('summary_tr.source_txn_public_id', '=', 't.public_id')
            .on('summary_tr.status', 'in', OPEN_TXN_REVERSAL_STATUSES)
        )
        .select([
          sql<number>`coalesce(sum(case when t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then 1 else 0 end), 0)`.as(
            'uncoded_count'
          ),
          sql<number>`coalesce(sum(case when t.budget_impact and t.categorisable and (t.sub_category_id is null or not (${validSubCategory})) then t.amount_cents else 0 end), 0)`.as(
            'uncoded_cents'
          ),
          sql<number>`coalesce(sum(case when t.categorisable and t.coding_pending_approval and t.sub_category_id is not null and ${validSubCategory} and t.locked_at is null then 1 else 0 end), 0)`.as(
            'auto_mapped_pending_count'
          ),
          sql<number>`coalesce(sum(case when t.budget_impact and summary_tr.id is not null then 1 else 0 end), 0)`.as(
            'pending_reversal_count'
          ),
          sql<number>`coalesce(sum(case when t.budget_impact and summary_tr.id is not null and summary_tr.matched_reversal_txn_public_id is null then t.amount_cents else 0 end), 0)`.as(
            'pending_reversal_cents'
          ),
        ])
        .where('t.project_id', '=', args.projectId)
        .executeTakeFirstOrThrow() as Promise<ProjectTransactionSummaryAggregateRow>,
    ]);

    return {
      monthKeys: monthRows.map((row) => row.month_key),
      rows: actualRows.map((row) => ({
        subCategoryId: asSubCategoryId(row.sub_category_id),
        monthKey: row.month_key,
        actualCents: toCount(row.actual_cents),
      })),
      periodSummaries: periodRows.map((row) => ({
        monthKey: row.month_key,
        uncodedCount: toCount(row.uncoded_count),
        uncodedAmountCents: toCount(row.uncoded_cents),
        pendingReversalCount: toCount(row.pending_reversal_count),
        pendingReversalCents: toCount(row.pending_reversal_cents),
      })),
      uncodedCount: toCount(uncodedRow.uncoded_count),
      uncodedAmountCents: toCount(uncodedRow.uncoded_cents),
      pendingReversalCount: toCount(uncodedRow.pending_reversal_count),
      pendingReversalCents: toCount(uncodedRow.pending_reversal_cents),
      autoMappedPendingCount: toCount(uncodedRow.auto_mapped_pending_count),
      invalidDateCount: 0,
    };
  });
}
