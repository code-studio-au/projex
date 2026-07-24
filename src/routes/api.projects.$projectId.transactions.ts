import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  loadRouteServerExport,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';

import { asProjectId } from '../types';

import {
  txnListPageQuerySchema,
  txnListSelectionQuerySchema,
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
        if (search.mode === 'selection') {
          const listTransactionsSelectionServer = await loadRouteServerExport<
            (args: {
              context: typeof serverContext;
              projectId: ReturnType<typeof asProjectId>;
              input: unknown;
            }) => Promise<unknown>
          >('../server/fns/transactions', 'listTransactionsSelectionServer');
          const query = validateOrThrow(txnListSelectionQuerySchema, search);
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
            await listTransactionsSelectionServer({
              context: serverContext,
              projectId: asProjectId(params.projectId),
              input: {
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
                search: query.search,
                drilldown,
              },
            })
          );
        }
        if (search.mode === 'page') {
          const listTransactionsPageServer = await loadRouteServerExport<
            (args: {
              context: typeof serverContext;
              projectId: ReturnType<typeof asProjectId>;
              input: unknown;
            }) => Promise<unknown>
          >('../server/fns/transactions', 'listTransactionsPageServer');
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
                search: query.search,
                drilldown,
              },
            })
          );
        }

        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'listTransactionsEndpoint',
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
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'createTxnEndpoint',
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
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'updateTxnEndpoint',
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
