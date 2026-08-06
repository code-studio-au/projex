import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { transactionCommentSummariesQueryOptions } from '../src/queries/transactionComments';
import { asProjectId, asTxnId } from '../src/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transaction comment queries', () => {
  test('loads scoped summaries without aborting an obsolete visible-row request', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await queryClient.fetchQuery(
      transactionCommentSummariesQueryOptions(
        'user-1',
        asProjectId('project-1'),
        { txnIds: [asTxnId('txn-b'), asTxnId('txn-a')] },
        { enabled: true }
      )
    );

    const call = fetchMock.mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) throw new Error('Expected the summaries query to call fetch');
    expect(call[0]).toBe(
      '/api/projects/project-1/transactions/comment-summaries?txnId=txn-a&txnId=txn-b'
    );
    expect(call[1]).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
    });
    expect(call[1]?.signal).toBeUndefined();
  });
});
