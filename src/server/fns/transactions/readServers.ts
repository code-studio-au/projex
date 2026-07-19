import { sql } from 'kysely';

import type { ProjectId, Txn } from '../../../types';
import type { TxnListPageInput, TxnListPageResult } from '../../../api/types';
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
