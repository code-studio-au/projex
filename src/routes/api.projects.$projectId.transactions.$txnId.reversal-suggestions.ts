import { createFileRoute } from '@tanstack/react-router';

import { asTxnId } from '../types';
import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/reversal-suggestions'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'listTxnReversalMatchSuggestionsEndpoint',
            context,
            input: {
              projectId: params.projectId,
              txnId: asTxnId(params.txnId),
            },
          })
        ),
    },
  },
});
