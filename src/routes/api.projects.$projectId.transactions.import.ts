import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import { txnImportInputSchema } from '../validation/apiSchemas';

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
              payload: await readValidatedJsonBody(
                request,
                txnImportInputSchema
              ),
            },
          })
        );
      },
    },
  },
});
