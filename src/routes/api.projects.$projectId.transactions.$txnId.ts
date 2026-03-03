import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId, asTxnId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/transactions/$txnId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteTxn(asProjectId(params.projectId), asTxnId(params.txnId));
          return { ok: true as const };
        }),
    },
  },
});
