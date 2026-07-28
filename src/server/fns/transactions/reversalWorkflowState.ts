import { AppError } from '../../../api/errors';
import type { TxnReversalRow } from './reversalDomain';

export function assertExpectedReversalVersion(
  reversal: TxnReversalRow,
  expectedVersion: number | undefined
) {
  if (
    typeof expectedVersion === 'number' &&
    reversal.version !== expectedVersion
  ) {
    throw new AppError(
      'CONFLICT',
      'This reversal workflow changed while you were reviewing it. Refresh and try again.'
    );
  }
}

export const clearedMatchFields = {
  matched_reversal_txn_public_id: null,
  matched_at: null,
  matched_by_user_id: null,
  match_method: null,
  match_score: null,
  candidate_count: null,
  match_evidence: null,
  source_snapshot: null,
  counterpart_snapshot: null,
  proposed_at: null,
  proposed_by_user_id: null,
} as const;
