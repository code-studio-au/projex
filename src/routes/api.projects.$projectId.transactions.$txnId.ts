import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/transactionEndpoints',
          exportName: 'deleteTxnEndpoint',
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
