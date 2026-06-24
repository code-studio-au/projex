import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/import-preview'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/importEndpoints',
            exportName: 'previewImportTransactionsEndpoint',
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
