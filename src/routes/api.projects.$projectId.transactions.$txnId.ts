import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { deleteTxnServer } from '../server/fns/transactions';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deleteTxnServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
          txnId: asTxnId(params.txnId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
