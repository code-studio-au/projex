import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import { importTransactionsEndpoint } from '../server/app/transactionEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/import'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: importTransactionsEndpoint,
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
