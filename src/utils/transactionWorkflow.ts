import type { UserId } from '../types';

export type TxnWorkflowSnapshot = {
  reviewedAt?: string;
  reviewedByUserId?: UserId;
  lockedAt?: string;
  lockedByUserId?: UserId;
};

export type TxnWorkflowPatch = {
  reviewed_at: string | null;
  reviewed_by_user_id: UserId | null;
  locked_at: string | null;
  locked_by_user_id: UserId | null;
};

export function planTxnWorkflowState(args: {
  current: TxnWorkflowSnapshot;
  reviewed?: boolean;
  locked?: boolean;
  actorUserId: UserId;
  now: string;
}): TxnWorkflowPatch {
  const { actorUserId, current, locked, now, reviewed } = args;

  if (reviewed === false) {
    return {
      reviewed_at: null,
      reviewed_by_user_id: null,
      locked_at: null,
      locked_by_user_id: null,
    };
  }

  const shouldBeReviewed =
    reviewed === true || locked === true || Boolean(current.reviewedAt);
  const reviewedAt = shouldBeReviewed ? (current.reviewedAt ?? now) : null;
  const reviewedByUserId = shouldBeReviewed
    ? (current.reviewedByUserId ?? actorUserId)
    : null;

  if (locked === true) {
    return {
      reviewed_at: reviewedAt ?? now,
      reviewed_by_user_id: reviewedByUserId ?? actorUserId,
      locked_at: now,
      locked_by_user_id: actorUserId,
    };
  }

  return {
    reviewed_at: reviewedAt,
    reviewed_by_user_id: reviewedByUserId,
    locked_at: locked === false ? null : (current.lockedAt ?? null),
    locked_by_user_id:
      locked === false ? null : (current.lockedByUserId ?? null),
  };
}
