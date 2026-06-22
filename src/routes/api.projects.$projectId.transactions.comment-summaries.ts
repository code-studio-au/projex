import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { listTransactionCommentSummariesEndpoint } from '../server/app/transactionEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/comment-summaries'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listTransactionCommentSummariesEndpoint,
            context,
            input: { projectId: params.projectId },
          })
        ),
    },
  },
});
