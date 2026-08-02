import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { txnReversalSuggestionsQueryOptions } from '../src/queries/transactions';
import { asProjectId, asTxnId } from '../src/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transaction reversal queries', () => {
  test('loads scoped suggestions through the API with query cancellation', async () => {
    const projectId = asProjectId('project-1');
    const txnId = asTxnId('txn-source');
    const suggestion = {
      txnId: asTxnId('txn-reversal'),
      date: '2026-07-31',
      item: 'Supplier refund',
      description: 'Reversal candidate',
      amountCents: -12_500,
      score: 100,
      reasons: ['Exact amount and opposite sign'],
      evidence: {
        amountExact: true,
        oppositeSign: true,
        reasons: ['Exact amount and opposite sign'],
      },
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(JSON.stringify([suggestion]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const result = await queryClient.fetchQuery(
      txnReversalSuggestionsQueryOptions({
        userId: 'user-1',
        projectId,
        txnId,
        enabled: true,
      })
    );

    expect(result).toEqual([suggestion]);
    const call = fetchMock.mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) throw new Error('Expected the suggestions query to call fetch');
    expect(call[0]).toBe(
      '/api/projects/project-1/transactions/txn-source/reversal-suggestions'
    );
    expect(call[1]).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
    });
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
