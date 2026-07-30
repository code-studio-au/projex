import type { TxnBulkSelectionRow } from '../../api/types';
import type { TxnId } from '../../types';

const REVIEWABLE_REVERSAL_STATUSES = new Set([
  'auto_matched_pending_approval',
  'auto_matched_ambiguous_pending_approval',
]);

export type ReversalReviewQueueState = {
  txnIds: TxnId[];
  currentIndex: number;
  resolvedTxnIds: TxnId[];
  approvedCount: number;
  rejectedCount: number;
};

export type ReversalReviewQueueSummary = {
  totalCount: number;
  reviewedCount: number;
  approvedCount: number;
  rejectedCount: number;
  remainingCount: number;
};

export function createReversalReviewQueue(
  rows: TxnBulkSelectionRow[]
): ReversalReviewQueueState | null {
  const seenReversalIds = new Set<string>();
  const txnIds = rows.flatMap((row) => {
    const reversal = row.reversal;
    if (
      row.locked ||
      !reversal ||
      reversal.side !== 'source' ||
      !REVIEWABLE_REVERSAL_STATUSES.has(reversal.status) ||
      seenReversalIds.has(reversal.id)
    ) {
      return [];
    }
    seenReversalIds.add(reversal.id);
    return [row.id];
  });
  if (!txnIds.length) return null;
  return {
    txnIds,
    currentIndex: 0,
    resolvedTxnIds: [],
    approvedCount: 0,
    rejectedCount: 0,
  };
}

export function reversalReviewQueueSummary(
  queue: ReversalReviewQueueState
): ReversalReviewQueueSummary {
  const reviewedCount = queue.resolvedTxnIds.length;
  return {
    totalCount: queue.txnIds.length,
    reviewedCount,
    approvedCount: queue.approvedCount,
    rejectedCount: queue.rejectedCount,
    remainingCount: queue.txnIds.length - reviewedCount,
  };
}

export function currentReversalReviewTxnId(
  queue: ReversalReviewQueueState | null
) {
  return queue?.txnIds[queue.currentIndex] ?? null;
}

function unresolvedIndexInDirection(
  queue: ReversalReviewQueueState,
  direction: -1 | 1
) {
  const resolvedTxnIds = new Set(queue.resolvedTxnIds);
  for (let step = 1; step < queue.txnIds.length; step += 1) {
    const index =
      (queue.currentIndex + direction * step + queue.txnIds.length) %
      queue.txnIds.length;
    if (!resolvedTxnIds.has(queue.txnIds[index]!)) return index;
  }
  return null;
}

export function canMoveReversalReviewQueue(
  queue: ReversalReviewQueueState,
  direction: -1 | 1
) {
  return unresolvedIndexInDirection(queue, direction) !== null;
}

export function moveReversalReviewQueue(
  queue: ReversalReviewQueueState,
  direction: -1 | 1
) {
  const nextIndex = unresolvedIndexInDirection(queue, direction);
  return nextIndex === null ? queue : { ...queue, currentIndex: nextIndex };
}

function firstUnresolvedIndex(
  queue: ReversalReviewQueueState,
  startIndex: number
) {
  const resolvedTxnIds = new Set(queue.resolvedTxnIds);
  for (let index = startIndex; index < queue.txnIds.length; index += 1) {
    if (!resolvedTxnIds.has(queue.txnIds[index]!)) return index;
  }
  for (let index = 0; index < startIndex; index += 1) {
    if (!resolvedTxnIds.has(queue.txnIds[index]!)) return index;
  }
  return null;
}

export function resolveReversalReviewItem(
  queue: ReversalReviewQueueState,
  outcome: 'approved' | 'rejected'
) {
  const currentTxnId = currentReversalReviewTxnId(queue);
  if (!currentTxnId || queue.resolvedTxnIds.includes(currentTxnId))
    return queue;

  const nextQueue: ReversalReviewQueueState = {
    ...queue,
    resolvedTxnIds: [...queue.resolvedTxnIds, currentTxnId],
    approvedCount: queue.approvedCount + (outcome === 'approved' ? 1 : 0),
    rejectedCount: queue.rejectedCount + (outcome === 'rejected' ? 1 : 0),
  };
  const nextIndex = firstUnresolvedIndex(nextQueue, queue.currentIndex + 1);
  return nextIndex === null
    ? nextQueue
    : { ...nextQueue, currentIndex: nextIndex };
}
