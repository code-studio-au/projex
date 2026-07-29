import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';

import {
  budgetUpdateMutationScope,
  transactionUpdateMutationScope,
} from '../src/queries/mutationScopes';
import { asProjectId } from '../src/types/ids';

test('financial mutation scopes are stable per project and isolated by resource', () => {
  const projectId = asProjectId('prj_financial_scope');

  expect(budgetUpdateMutationScope(projectId)).toEqual({
    id: 'budget-update:prj_financial_scope',
  });
  expect(transactionUpdateMutationScope(projectId)).toEqual({
    id: 'transaction-update:prj_financial_scope',
  });
});

describe('scoped financial mutations', () => {
  test('serializes a later request even when it would otherwise finish first', async () => {
    const projectId = asProjectId('prj_financial_order');
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const mutationCache = queryClient.getMutationCache();
    const first = mutationCache.build(queryClient, {
      scope: transactionUpdateMutationScope(projectId),
      mutationFn: async () => {
        events.push('first:start');
        await firstGate;
        events.push('first:finish');
      },
    });
    const second = mutationCache.build(queryClient, {
      scope: transactionUpdateMutationScope(projectId),
      mutationFn: async () => {
        events.push('second:start');
        events.push('second:finish');
      },
    });

    const firstRequest = first.execute(undefined);
    const secondRequest = second.execute(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['first:start']);

    releaseFirst();
    await Promise.all([firstRequest, secondRequest]);
    expect(events).toEqual([
      'first:start',
      'first:finish',
      'second:start',
      'second:finish',
    ]);
  });
});
