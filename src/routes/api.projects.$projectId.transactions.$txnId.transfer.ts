import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { transferTxnServer } from '../server/fns/transactions';
import { transferTxnMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/transfer'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
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
          await transferTxnServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body.transfer,
          })
        );
      },
    },
  },
});
