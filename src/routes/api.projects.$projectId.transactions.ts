import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asProjectId } from '../types';
import {
  txnMutationBodySchema,
  txnUpdateMutationBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/transactions')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listTransactions(asProjectId(params.projectId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            txnMutationBodySchema,
            await readJsonBody(request)
          );
          return api.createTxn(asProjectId(params.projectId), body.txn);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            txnUpdateMutationBodySchema,
            await readJsonBody(request)
          );
          return api.updateTxn(asProjectId(params.projectId), body.txn);
        }),
    },
  },
});
