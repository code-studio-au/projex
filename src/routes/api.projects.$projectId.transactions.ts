import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asProjectId } from '../types';
import {
  txnListPageQuerySchema,
  txnMutationBodySchema,
  txnUpdateMutationBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/transactions')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => {
          const url = new URL(request.url);
          const search = Object.fromEntries(url.searchParams.entries());
          if (search.mode === 'page') {
            const query = validateOrThrow(txnListPageQuerySchema, search);
            const drilldown =
              query.drilldownKind === 'subcategory' &&
              query.categoryId &&
              query.subCategoryId
                ? {
                    kind: 'subcategory' as const,
                    categoryId: query.categoryId,
                    subCategoryId: query.subCategoryId,
                  }
                : query.drilldownKind === 'category' && query.categoryId
                  ? {
                      kind: 'category' as const,
                      categoryId: query.categoryId,
                    }
                  : undefined;

            return api.listTransactionsPage(asProjectId(params.projectId), {
              pageIndex: query.pageIndex,
              pageSize: query.pageSize,
              sort:
                query.sortField && query.sortDirection
                  ? {
                      field: query.sortField,
                      direction: query.sortDirection,
                    }
                  : undefined,
              yearFilter: query.yearFilter,
              quarterFilter: query.quarterFilter,
              monthFilterKey: query.monthFilterKey,
              transactionView: query.transactionView,
              drilldown,
            });
          }

          return api.listTransactions(asProjectId(params.projectId));
        }),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            txnMutationBodySchema,
            await readJsonBody(request)
          );
          return api.createTxn(asProjectId(params.projectId), body.txn);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            txnUpdateMutationBodySchema,
            await readJsonBody(request)
          );
          return api.updateTxn(asProjectId(params.projectId), body.txn);
        }),
    },
  },
});
