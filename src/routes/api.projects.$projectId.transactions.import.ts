import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/import'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'importTransactionsEndpoint',
            context,
            input: {
              projectId: params.projectId,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
