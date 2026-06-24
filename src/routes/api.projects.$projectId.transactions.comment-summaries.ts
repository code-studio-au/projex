import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/comment-summaries'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'listTransactionCommentSummariesEndpoint',
            context,
            input: { projectId: params.projectId },
          })
        ),
    },
  },
});
