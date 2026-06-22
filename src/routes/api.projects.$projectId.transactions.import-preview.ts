import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import { previewImportTransactionsEndpoint } from '../server/app/importEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/import-preview'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: previewImportTransactionsEndpoint,
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
