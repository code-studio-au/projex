import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import { asTxnId } from '../types';
import { transferTxnEndpoint } from '../server/app/transactionEndpoints';
import { transferTxnMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/transfer'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
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
        return jsonApi(
          await executeApiEndpoint({
            endpoint: transferTxnEndpoint,
            context,
            input: {
              projectId: params.projectId,
              payload: body.transfer,
            },
          })
        );
      },
    },
  },
});
