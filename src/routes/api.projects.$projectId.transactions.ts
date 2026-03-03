import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/transactions')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listTransactions(asProjectId(params.projectId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as { txn: Parameters<
            typeof api.createTxn
          >[1] };
          return api.createTxn(asProjectId(params.projectId), body.txn);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as { txn: Parameters<
            typeof api.updateTxn
          >[1] };
          return api.updateTxn(asProjectId(params.projectId), body.txn);
        }),
    },
  },
});
