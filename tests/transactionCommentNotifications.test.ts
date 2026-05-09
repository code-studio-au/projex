import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTransactionCommentUrl } from '../src/server/notifications/transactionCommentNotifications.ts';
import {
  asCompanyId,
  asProjectId,
  asTxnCommentId,
  asTxnId,
} from '../src/types/index.ts';

test('transaction comment notification links open the project comment thread', () => {
  const previousAppBaseUrl = process.env.PROJEX_APP_BASE_URL;
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.PROJEX_APP_BASE_URL = 'https://app.example.com';
  delete process.env.BETTER_AUTH_URL;

  try {
    assert.equal(
      buildTransactionCommentUrl({
        companyId: asCompanyId('co_1'),
        projectId: asProjectId('prj_1'),
        txnId: asTxnId('txn_1'),
        commentId: asTxnCommentId('txn_comment_1'),
      }),
      'https://app.example.com/c/co_1/p/prj_1?tab=transactions&commentTxn=txn_1&commentId=txn_comment_1'
    );
  } finally {
    if (previousAppBaseUrl === undefined) {
      delete process.env.PROJEX_APP_BASE_URL;
    } else {
      process.env.PROJEX_APP_BASE_URL = previousAppBaseUrl;
    }

    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  }
});
