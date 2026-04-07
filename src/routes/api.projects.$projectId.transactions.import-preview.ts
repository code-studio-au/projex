import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';
import { txnImportPreviewInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/transactions/import-preview')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(txnImportPreviewInputSchema, await request.json());
          return api.previewImportTransactions(asProjectId(params.projectId), body);
        }),
    },
  },
});
