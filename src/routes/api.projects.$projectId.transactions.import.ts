import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/transactions/import')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.importTransactions>[1];
          return api.importTransactions(asProjectId(params.projectId), body);
        }),
    },
  },
});
