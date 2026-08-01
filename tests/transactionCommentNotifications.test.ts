import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const { sendAuthEmailMock } = vi.hoisted(() => ({
  sendAuthEmailMock: vi.fn(),
}));

vi.mock('../src/server/auth/email.ts', () => ({
  sendAuthEmail: sendAuthEmailMock,
}));

import {
  buildTransactionCommentUrl,
  sendTransactionCommentAssignmentEmail,
} from '../src/server/notifications/transactionCommentNotifications.ts';
import {
  asCompanyId,
  asProjectId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';

afterEach(() => {
  vi.clearAllMocks();
});

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

test('transaction comment emails escape all dynamic HTML content', async () => {
  sendAuthEmailMock.mockResolvedValue('email');

  await sendTransactionCommentAssignmentEmail({
    to: {
      id: asUserId('usr_recipient'),
      email: 'recipient@example.com',
      name: 'Recipient <Admin>',
    },
    actor: {
      id: asUserId('usr_actor'),
      email: 'actor@example.com',
      name: `Actor "Owner"`,
    },
    companyName: 'Acme & Sons',
    projectName: `Project 'Alpha'`,
    txnItem: '<Invoice>',
    txnDescription: '<img src=x onerror=alert(1)>',
    txnDate: '2026-07-28',
    commentBody: '<a href="https://evil.example">click</a>',
    commentUrl: `https://app.example.com/c/co_1?comment="quoted"&next='single'`,
  });

  const sendCall = sendAuthEmailMock.mock.calls[0] as
    [Record<string, string>] | undefined;
  const html = sendCall?.[0].html ?? '';
  assert.doesNotMatch(html, /<img|<a href="https:\/\/evil\.example"/);
  assert.match(html, /Recipient &lt;Admin&gt;/);
  assert.match(html, /Actor &quot;Owner&quot;/);
  assert.match(html, /Acme &amp; Sons/);
  assert.match(html, /Project &#39;Alpha&#39;/);
  assert.match(
    html,
    /href="https:\/\/app\.example\.com\/c\/co_1\?comment=&quot;quoted&quot;&amp;next=&#39;single&#39;"/
  );
});
