import { sql } from 'kysely';

import { asSubCategoryId, type ProjectId, type Txn } from '../../../types';
import type {
  ProjectTransactionSummary,
  TxnListPageInput,
  TxnListPageResult,
} from '../../../api/types';
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
  pendingTxnReversalExistsSql,
  prefixedTxnSelectColumns,
  toCount,
  txnAssignedToUserSql,
  txnReversalJoin,
  txnReversalSelectExpressions,
  txnValidSubCategorySql,
  type ProjectTransactionSummaryAggregateRow,
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
      .select([
        ...prefixedTxnSelectColumns('t'),
        ...txnReversalSelectExpressions({}),
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
      .select([
        ...prefixedTxnSelectColumns('t'),
        ...txnReversalSelectExpressions({}),
      ])
      .where('t.project_id', '=', args.projectId)
      .where('t.public_id', '=', args.txnId)
      .executeTakeFirst();
    return row ? toTxn(row) : null;
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
        .select([
          ...prefixedTxnSelectColumns('t'),
          ...txnReversalSelectExpressions({}),
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
            const pendingReversal = pendingTxnReversalExistsSql();
            return [
              sql<number>`count(*)`.as('total_count'),
              sql<number>`coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0)`.as(
                'budget_impact_cents'
              ),
              sql<number>`coalesce(sum(case when ${pendingReversal} then 1 else 0 end), 0)`.as(
                'pending_reversal_count'
              ),
              sql<number>`coalesce(sum(case when ${pendingReversal} then t.amount_cents else 0 end), 0)`.as(
                'pending_reversal_cents'
              ),
              sql<number>`coalesce(sum(case when t.budget_impact then t.amount_cents else 0 end), 0) - coalesce(sum(case when ${pendingReversal} then t.amount_cents else 0 end), 0)`.as(
                'adjusted_budget_impact_cents'
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

    const [monthRows, actualRows, uncodedRow] = await Promise.all([
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
      uncodedCount: toCount(uncodedRow.uncoded_count),
      uncodedAmountCents: toCount(uncodedRow.uncoded_cents),
      autoMappedPendingCount: toCount(uncodedRow.auto_mapped_pending_count),
      invalidDateCount: 0,
    };
  });
}
