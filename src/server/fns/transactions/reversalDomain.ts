import type { Kysely } from 'kysely';

import { AppError } from '../../../api/errors';
import type { ProjectId, Txn, TxnId, TxnReversalStatus } from '../../../types';
import { toTxn } from '../../mappers/transactionRows';
import type { DB } from '../../db/schema';
import { requireOperationalProjectForAction } from '../resourceGuards';
import type { ServerFnContextInput } from '../runtime';
import {
  assertTxnUnlocked,
  prefixedTxnSelectColumns,
  txnReversalJoin,
  txnReversalSelectExpressions,
} from './shared';
import { isValidReversalAutoMatchEdge } from './reversalMatching';
import type { ReversalDbExecutor } from './reversalTypes';

export type TxnReversalRow = {
  id: string;
  company_id: string;
  project_id: string;
  source_txn_public_id: string;
  matched_reversal_txn_public_id: string | null;
  expected_project_id: string | null;
  status: TxnReversalStatus;
  marked_at: string;
  marked_by_user_id: string;
  matched_at: string | null;
  matched_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export function isOpenReversalStatus(
  status: TxnReversalStatus
): status is 'pending_reversal' | 'reversal_exception' {
  return status === 'pending_reversal' || status === 'reversal_exception';
}

export function isSuggestedReversalStatus(
  status: TxnReversalStatus
): status is
  | 'auto_matched_pending_approval'
  | 'auto_matched_ambiguous_pending_approval' {
  return (
    status === 'auto_matched_pending_approval' ||
    status === 'auto_matched_ambiguous_pending_approval'
  );
}

export async function getTxnOrThrow(args: {
  db: ReversalDbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<Txn> {
  const row = await args.db
    .selectFrom('txns as t')
    .leftJoin('txn_reversals as tr', txnReversalJoin())
    .select([
      ...prefixedTxnSelectColumns('t'),
      ...txnReversalSelectExpressions({}),
    ])
    .where('t.project_id', '=', args.projectId)
    .where('t.public_id', '=', args.txnId)
    .executeTakeFirst();
  if (!row) {
    throw new AppError('NOT_FOUND', 'Unknown transaction');
  }
  return toTxn(row);
}

export async function getSourceReversalRow(args: {
  db: ReversalDbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<TxnReversalRow | null> {
  return (
    (await args.db
      .selectFrom('txn_reversals')
      .selectAll()
      .where('project_id', '=', args.projectId)
      .where('source_txn_public_id', '=', args.txnId)
      .executeTakeFirst()) ?? null
  );
}

export async function getReversalRowForAnyTxn(args: {
  db: ReversalDbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<TxnReversalRow | null> {
  return (
    (await args.db
      .selectFrom('txn_reversals')
      .selectAll()
      .where('project_id', '=', args.projectId)
      .where((eb) =>
        eb.or([
          eb('source_txn_public_id', '=', args.txnId),
          eb('matched_reversal_txn_public_id', '=', args.txnId),
        ])
      )
      .executeTakeFirst()) ?? null
  );
}

export async function assertExpectedProject(args: {
  context: ServerFnContextInput;
  sourceProjectId: ProjectId;
  expectedProjectId?: ProjectId;
  db: ReversalDbExecutor;
  companyId: string;
}): Promise<void> {
  if (!args.expectedProjectId) return;
  if (args.expectedProjectId === args.sourceProjectId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Expected destination project must be different from the current project'
    );
  }
  const project = await requireOperationalProjectForAction(
    args.context,
    args.expectedProjectId,
    'project:view',
    args.db as Kysely<DB>
  );
  if (project.companyId !== args.companyId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Expected destination project must belong to the same company'
    );
  }
}

export function assertSourceTxnEligible(txn: Txn): void {
  assertTxnUnlocked(txn);
  if (!txn.budgetImpact) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only budget-impact transactions can be marked as pending reversal'
    );
  }
  if (txn.amountCents <= 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Pending reversal can only be recorded against positive source transactions'
    );
  }
}

export function assertCounterpartTxnEligible(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}): void {
  assertTxnUnlocked(args.counterpartTxn);
  if (!args.counterpartTxn.budgetImpact) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Matched reversal transactions must affect the budget'
    );
  }
  if (args.counterpartTxn.id === args.sourceTxn.id) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A transaction cannot be matched to itself as a reversal'
    );
  }
  if (args.counterpartTxn.amountCents >= 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Matched reversal transactions must be negative amounts'
    );
  }
  if (
    Math.abs(args.counterpartTxn.amountCents) !== args.sourceTxn.amountCents
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Matched reversal transactions must have the same absolute amount as the source transaction'
    );
  }
}

export function assertSuggestedMatchMetadataCompatible(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}): void {
  if (isValidReversalAutoMatchEdge(args)) return;
  throw new AppError(
    'CONFLICT',
    'This auto-matched reversal is no longer compatible with the source transaction. Reject it and review the match manually.'
  );
}
