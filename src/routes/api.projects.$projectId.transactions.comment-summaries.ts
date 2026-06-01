import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { listTransactionCommentSummariesServer } from '../server/fns/transactionComments';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/comment-summaries'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listTransactionCommentSummariesServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
    },
  },
});
