import {
  sql,
  type JoinCallbackExpression,
  type RawBuilder,
  type SelectQueryBuilder,
} from 'kysely';

import { AppError } from '../../../api/errors';
import type {
  ImportCandidateStatus,
  ImportPreviewRow,
  ProjectId,
  Txn,
  TxnReversalStatus,
} from '../../../types';
import type { TxnListFilterInput, TxnListPageInput } from '../../../api/types';
import type { DB, TxnTable } from '../../db/schema';
import type { ProjectActionContext } from '../resourceGuards';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
} from '../resourceGuards';
import { assertTxnCodingAllowed } from '../../../utils/transactions';

export const IMPORT_PREVIEW_RATE_LIMIT = {
  limit: 12,
  windowMs: 10 * 60 * 1000,
} as const;

export const IMPORT_COMMIT_RATE_LIMIT = {
  limit: 8,
  windowMs: 10 * 60 * 1000,
} as const;

export type TxnAliasDb = DB & { t: TxnTable };

export type TxnPageSummaryRow = {
  total_count: number | string;
  budget_impact_cents: number | string;
  pending_reversal_count: number | string;
  pending_reversal_cents: number | string;
  adjusted_budget_impact_cents: number | string;
  uncoded_count: number | string;
  uncoded_cents: number | string;
  coding_approval_count: number | string;
  reversal_review_count: number | string;
  awaiting_reversal_count: number | string;
  source_only_count: number | string;
  assigned_to_me_count: number | string;
  reviewed_count: number | string;
  locked_count: number | string;
};

export type ProjectTransactionSummaryRow = {
  sub_category_id: string;
  month_key: string;
  actual_cents: number | string;
};

export type ProjectTransactionSummaryAggregateRow = {
  uncoded_count: number | string;
  uncoded_cents: number | string;
  auto_mapped_pending_count: number | string;
};

export const OPEN_TXN_REVERSAL_STATUSES = [
  'pending_reversal',
  'auto_matched_pending_approval',
  'auto_matched_ambiguous_pending_approval',
  'reversal_exception',
] as const satisfies ReadonlyArray<TxnReversalStatus>;

export function txnSelectColumns() {
  return [
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
  ] as const;
}

export function prefixedTxnSelectColumns(prefix: 't') {
  return txnSelectColumns().map((column) => `${prefix}.${column}` as const);
}

type TxnReversalJoinCallback = JoinCallbackExpression<
  TxnAliasDb,
  't',
  'txn_reversals as tr'
>;

export function txnReversalJoin(): TxnReversalJoinCallback {
  return (join) =>
    join
      .onRef('tr.project_id', '=', 't.project_id')
      .on((eb) =>
        eb.or([
          eb('tr.source_txn_public_id', '=', eb.ref('t.public_id')),
          eb('tr.matched_reversal_txn_public_id', '=', eb.ref('t.public_id')),
        ])
      );
}

export function txnReversalSelectExpressions(args: {
  txnAlias?: 't';
  reversalAlias?: 'tr';
}) {
  const txnAlias = args.txnAlias ?? 't';
  const reversalAlias = args.reversalAlias ?? 'tr';
  return [
    sql<string | null>`${sql.ref(`${reversalAlias}.id`)}`.as('reversal_id'),
    sql<TxnReversalStatus | null>`${sql.ref(`${reversalAlias}.status`)}`.as(
      'reversal_status'
    ),
    sql<'source' | 'reversal' | null>`case
      when ${sql.ref(`${reversalAlias}.id`)} is null then null
      when ${sql.ref(`${reversalAlias}.source_txn_public_id`)} = ${sql.ref(`${txnAlias}.public_id`)} then 'source'
      else 'reversal'
    end`.as('reversal_side'),
    sql<string | null>`case
      when ${sql.ref(`${reversalAlias}.id`)} is null then null
      when ${sql.ref(`${reversalAlias}.source_txn_public_id`)} = ${sql.ref(`${txnAlias}.public_id`)} then ${sql.ref(`${reversalAlias}.matched_reversal_txn_public_id`)}
      else ${sql.ref(`${reversalAlias}.source_txn_public_id`)}
    end`.as('reversal_counterpart_txn_public_id'),
    sql<string | null>`${sql.ref(`${reversalAlias}.expected_project_id`)}`.as(
      'reversal_expected_project_id'
    ),
    sql<string | null>`${sql.ref(`${reversalAlias}.marked_at`)}`.as(
      'reversal_marked_at'
    ),
    sql<string | null>`${sql.ref(`${reversalAlias}.marked_by_user_id`)}`.as(
      'reversal_marked_by_user_id'
    ),
    sql<string | null>`${sql.ref(`${reversalAlias}.matched_at`)}`.as(
      'reversal_matched_at'
    ),
    sql<string | null>`${sql.ref(`${reversalAlias}.matched_by_user_id`)}`.as(
      'reversal_matched_by_user_id'
    ),
    sql<string | null>`${sql.ref(`${reversalAlias}.created_at`)}`.as(
      'reversal_created_at'
    ),
    sql<string | null>`${sql.ref(`${reversalAlias}.updated_at`)}`.as(
      'reversal_updated_at'
    ),
  ] as const;
}

export function pendingTxnReversalExistsSql() {
  return sql<boolean>`exists (
    select 1
    from txn_reversals tr
    where tr.project_id = t.project_id
      and tr.source_txn_public_id = t.public_id
      and tr.status in (${sql.join(OPEN_TXN_REVERSAL_STATUSES)})
  )`;
}

export function matchedTxnReversalExistsSql() {
  return sql<boolean>`exists (
    select 1
    from txn_reversals tr
    where tr.project_id = t.project_id
      and (
        tr.source_txn_public_id = t.public_id
        or tr.matched_reversal_txn_public_id = t.public_id
      )
      and tr.status = 'reversed_matched'
  )`;
}

export function needsReviewTxnSql() {
  return sql<boolean>`(
    (
      t.categorisable
      and t.coding_pending_approval
      and t.sub_category_id is not null
      and ${txnValidSubCategorySql()}
    )
    or exists (
      select 1
      from txn_reversals tr
      where tr.project_id = t.project_id
        and tr.source_txn_public_id = t.public_id
        and tr.status in (
          'auto_matched_pending_approval',
          'auto_matched_ambiguous_pending_approval',
          'reversal_exception'
        )
    )
  )`;
}

export function txnValidSubCategorySql(txnTableReference: 't' | 'txns' = 't') {
  const subCategoryId = sql.ref(`${txnTableReference}.sub_category_id`);
  const projectId = sql.ref(`${txnTableReference}.project_id`);

  return sql<boolean>`exists (
    select 1
    from sub_categories sc
    where sc.id = ${subCategoryId}
      and sc.project_id = ${projectId}
  )`;
}

export function txnAssignedToUserSql(userId: string) {
  return sql<boolean>`exists (
    select 1
    from txn_comments tc
    where tc.project_id = t.project_id
      and tc.txn_public_id = t.public_id
      and tc.assigned_to_user_id = ${userId}
      and tc.resolved_at is null
  )`;
}

export function quarterFilterNumber(value: TxnListPageInput['quarterFilter']) {
  if (value === 'Q1') return 1;
  if (value === 'Q2') return 2;
  if (value === 'Q3') return 3;
  if (value === 'Q4') return 4;
  return null;
}

export function buildTransactionsPageFilters(args: {
  projectId: ProjectId;
  userId: string;
  input: TxnListFilterInput;
}): RawBuilder<boolean>[] {
  const filters: RawBuilder<boolean>[] = [
    sql<boolean>`t.project_id = ${args.projectId}`,
  ];
  const validSubCategory = txnValidSubCategorySql();
  const assignedToUser = txnAssignedToUserSql(args.userId);
  const pendingReversal = pendingTxnReversalExistsSql();
  const matchedReversal = matchedTxnReversalExistsSql();

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

  if (args.input.transactionView === 'needs-review') {
    filters.push(needsReviewTxnSql());
  }

  if (args.input.transactionView === 'auto-mapped-pending') {
    filters.push(
      sql<boolean>`t.categorisable and t.coding_pending_approval and t.sub_category_id is not null and ${validSubCategory}`
    );
  }

  if (args.input.transactionView === 'assigned-to-me') {
    filters.push(assignedToUser);
  }

  if (args.input.transactionView === 'pending-reversal') {
    filters.push(pendingReversal);
  }

  if (args.input.transactionView === 'matched-reversal-pairs') {
    filters.push(matchedReversal);
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

export function applyTxnPageFilters<O>(
  query: SelectQueryBuilder<TxnAliasDb, 't', O>,
  filters: RawBuilder<boolean>[]
): SelectQueryBuilder<TxnAliasDb, 't', O> {
  let next = query;
  for (const filter of filters) {
    next = next.where(filter);
  }
  return next;
}

export function toCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export function assertTxnUnlocked(txn: Txn): void {
  if (txn.lockedAt) {
    throw new AppError(
      'CONFLICT',
      'Transaction is locked and cannot be changed'
    );
  }
}

export type BulkTxnActionRow = {
  public_id: string;
  categorisable: boolean;
  category_id: string | null;
  sub_category_id: string | null;
  company_default_mapping_rule_id: string | null;
  coding_source: string | null;
  coding_pending_approval: boolean;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  locked_at: string | null;
  locked_by_user_id: string | null;
  in_reversal_workflow: boolean;
};

export function workflowPatchIsNoop(args: {
  row: BulkTxnActionRow;
  patch: {
    reviewed_at: string | null | undefined;
    reviewed_by_user_id: string | null | undefined;
    locked_at: string | null | undefined;
    locked_by_user_id: string | null | undefined;
  };
}) {
  return (
    args.row.reviewed_at === args.patch.reviewed_at &&
    args.row.reviewed_by_user_id === args.patch.reviewed_by_user_id &&
    args.row.locked_at === args.patch.locked_at &&
    args.row.locked_by_user_id === args.patch.locked_by_user_id
  );
}

export async function assertTransactionResourceOwnership(
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

export function importCandidateStatusForPreviewRow(
  row: ImportPreviewRow
): ImportCandidateStatus {
  if (row.importAction === 'exclude') return 'excluded';
  if (row.importAction === 'review') return 'needs_project_review';
  if (row.mappingStatus === 'invalid') return 'invalid';
  if (row.duplicate) return 'duplicate';
  return 'ready';
}

export function persistedImportRuleId(row: ImportPreviewRow) {
  if (!row.importRuleId) return null;
  return String(row.importRuleId).startsWith('default_import_rule_')
    ? null
    : row.importRuleId;
}
