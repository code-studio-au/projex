import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteTxnEndpoint } from '../server/app/transactionEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteTxnEndpoint,
          context,
          input: {
            projectId: params.projectId,
            txnId: params.txnId,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
