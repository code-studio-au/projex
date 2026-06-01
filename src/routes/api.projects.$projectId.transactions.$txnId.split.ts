import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { splitTxnServer } from '../server/fns/transactions';
import { splitTxnMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/split'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          splitTxnMutationBodySchema,
          await readJsonBody(request)
        );
        const txnId = asTxnId(params.txnId);
        if (body.split.txnId !== txnId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Split transaction id does not match route'
          );
        }
        return jsonApi(
          await splitTxnServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body.split,
          })
        );
      },
    },
  },
});
