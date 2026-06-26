import assert from 'node:assert/strict';
import { test } from 'vitest';

import { asUserId } from '../src/types/index.ts';
import { planTxnWorkflowState } from '../src/utils/transactionWorkflow.ts';

const actor = asUserId('usr_actor');
const previousReviewer = asUserId('usr_reviewer');
const previousLocker = asUserId('usr_locker');
const now = '2026-05-06T10:00:00.000Z';

test('transaction workflow marks transactions as reviewed', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {},
      reviewed: true,
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: now,
      reviewed_by_user_id: actor,
      locked_at: null,
      locked_by_user_id: null,
    }
  );
});

test('transaction workflow leaves review fields empty when no review or lock state is requested', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {},
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: null,
      reviewed_by_user_id: null,
      locked_at: null,
      locked_by_user_id: null,
    }
  );
});

test('transaction workflow locking implies reviewed state', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {},
      locked: true,
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: now,
      reviewed_by_user_id: actor,
      locked_at: now,
      locked_by_user_id: actor,
    }
  );
});

test('transaction workflow unlock preserves review metadata', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {
        reviewedAt: '2026-05-05T09:00:00.000Z',
        reviewedByUserId: previousReviewer,
        lockedAt: '2026-05-05T10:00:00.000Z',
        lockedByUserId: previousLocker,
      },
      locked: false,
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: '2026-05-05T09:00:00.000Z',
      reviewed_by_user_id: previousReviewer,
      locked_at: null,
      locked_by_user_id: null,
    }
  );
});

test('transaction workflow preserves existing lock metadata when no explicit lock change is requested', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {
        reviewedAt: '2026-05-05T09:00:00.000Z',
        reviewedByUserId: previousReviewer,
        lockedAt: '2026-05-05T10:00:00.000Z',
        lockedByUserId: previousLocker,
      },
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: '2026-05-05T09:00:00.000Z',
      reviewed_by_user_id: previousReviewer,
      locked_at: '2026-05-05T10:00:00.000Z',
      locked_by_user_id: previousLocker,
    }
  );
});

test('transaction workflow unreview clears lock metadata', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {
        reviewedAt: '2026-05-05T09:00:00.000Z',
        reviewedByUserId: previousReviewer,
        lockedAt: '2026-05-05T10:00:00.000Z',
        lockedByUserId: previousLocker,
      },
      reviewed: false,
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: null,
      reviewed_by_user_id: null,
      locked_at: null,
      locked_by_user_id: null,
    }
  );
});

test('transaction workflow locking preserves existing review metadata when already reviewed', () => {
  assert.deepEqual(
    planTxnWorkflowState({
      current: {
        reviewedAt: '2026-05-05T09:00:00.000Z',
        reviewedByUserId: previousReviewer,
      },
      locked: true,
      actorUserId: actor,
      now,
    }),
    {
      reviewed_at: '2026-05-05T09:00:00.000Z',
      reviewed_by_user_id: previousReviewer,
      locked_at: now,
      locked_by_user_id: actor,
    }
  );
});
