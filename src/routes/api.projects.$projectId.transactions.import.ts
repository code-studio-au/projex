import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';
import { txnImportInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/transactions/import')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(txnImportInputSchema, await request.json());
          return api.importTransactions(asProjectId(params.projectId), body);
        }),
    },
  },
});
