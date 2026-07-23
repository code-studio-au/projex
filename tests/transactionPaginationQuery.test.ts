import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { test } from 'vitest';

import type { TxnListPageInput, TxnListPageResult } from '../src/api/types.ts';
import { transactionsPageQueryOptions } from '../src/queries/transactions.ts';
import { asProjectId } from '../src/types/index.ts';

const projectId = asProjectId('prj_pagination_test');
const previousPage: TxnListPageResult = {
  rows: [],
  summary: {
    totalCount: 42,
    budgetImpactCents: 10_000,
    pendingReversalCount: 0,
    pendingReversalCents: 0,
    adjustedBudgetImpactCents: 10_000,
    uncodedCount: 0,
    uncodedCents: 0,
    codingApprovalCount: 0,
    reversalReviewCount: 0,
    reversalMatchReviewCount: 0,
    awaitingReversalCount: 0,
    sourceOnlyCount: 0,
    assignedToMeCount: 0,
    reviewedCount: 0,
    lockedCount: 0,
    invalidDateCount: 0,
  },
};

const firstPageInput: TxnListPageInput = {
  pageIndex: 0,
  pageSize: 20,
  sort: { field: 'date', direction: 'desc' },
  transactionView: 'all',
};

async function assertKeepsPreviousPage(nextInput: TxnListPageInput) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const firstOptions = transactionsPageQueryOptions(
    'user_pagination_test',
    projectId,
    firstPageInput
  );
  const nextOptions = transactionsPageQueryOptions(
    'user_pagination_test',
    projectId,
    nextInput
  );
  const pendingNextPage = new Promise<TxnListPageResult>(() => {});
  const observer = new QueryObserver(queryClient, {
    ...firstOptions,
    initialData: previousPage,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const unsubscribe = observer.subscribe(() => {});

  observer.setOptions({
    ...nextOptions,
    queryFn: () => pendingNextPage,
  });

  const transition = observer.getCurrentResult();
  assert.strictEqual(transition.data, previousPage);
  assert.equal(transition.isPlaceholderData, true);
  assert.equal(transition.isFetching, true);

  unsubscribe();
  observer.destroy();
  queryClient.clear();
}

test('transaction pagination keeps the previous page during page transitions', async () => {
  await assertKeepsPreviousPage({
    ...firstPageInput,
    pageIndex: 1,
  });
});

test('transaction pagination keeps the previous page during filter transitions', async () => {
  await assertKeepsPreviousPage({
    ...firstPageInput,
    yearFilter: '2026',
    transactionView: 'needs-review',
  });
});
