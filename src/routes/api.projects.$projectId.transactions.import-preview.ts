import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/transactions/import-preview')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.previewImportTransactions>[1];
          return api.previewImportTransactions(asProjectId(params.projectId), body);
        }),
    },
  },
});
