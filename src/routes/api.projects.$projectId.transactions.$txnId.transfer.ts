import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { readJsonBody, withApi } from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { transferTxnMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/transfer'
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            transferTxnMutationBodySchema,
            await readJsonBody(request)
          );
          const txnId = asTxnId(params.txnId);
          if (body.transfer.txnId !== txnId) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Transfer transaction id does not match route'
            );
          }
          return api.transferTxn(asProjectId(params.projectId), body.transfer);
        }),
    },
  },
});
