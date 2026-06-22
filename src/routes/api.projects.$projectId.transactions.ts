import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { listTransactionsPageServer } from '../server/fns/transactions';
import {
  createTxnEndpoint,
  listTransactionsEndpoint,
  updateTxnEndpoint,
} from '../server/app/transactionEndpoints';
import {
  txnListPageQuerySchema,
  txnMutationBodySchema,
  txnUpdateMutationBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/transactions')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
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

          return jsonApi(
            await listTransactionsPageServer({
              context: serverContext,
              projectId: asProjectId(params.projectId),
              input: {
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
              },
            })
          );
        }

        return jsonApi(
          await executeApiEndpoint({
            endpoint: listTransactionsEndpoint,
            context,
            input: { projectId: params.projectId },
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const body = validateOrThrow(
          txnMutationBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createTxnEndpoint,
            context,
            input: {
              projectId: params.projectId,
              payload: body.txn,
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        const body = validateOrThrow(
          txnUpdateMutationBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateTxnEndpoint,
            context,
            input: {
              projectId: params.projectId,
              payload: body.txn,
            },
          })
        );
      },
    },
  },
});
