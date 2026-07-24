import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import { txnImportPreviewInputSchema } from '../validation/apiSchemas';

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
              payload: await readValidatedJsonBody(
                request,
                txnImportPreviewInputSchema,
                { maxBytes: 8 * 1024 * 1024 }
              ),
            },
          })
        );
      },
    },
  },
});
