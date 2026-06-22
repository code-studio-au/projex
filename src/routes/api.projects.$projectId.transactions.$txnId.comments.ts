import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createTransactionCommentEndpoint,
  listTransactionCommentsEndpoint,
} from '../server/app/transactionEndpoints';
import { asTxnId } from '../types';
import { txnCommentMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/comments'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listTransactionCommentsEndpoint,
            context,
            input: {
              projectId: params.projectId,
              txnId: params.txnId,
            },
          })
        ),
      POST: async ({ context, request, params }) => {
        const body = validateOrThrow(
          txnCommentMutationBodySchema,
          await readJsonBody(request)
        );
        const txnId = asTxnId(params.txnId);
        if (body.comment.txnId !== txnId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Transaction comment txnId does not match route'
          );
        }
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createTransactionCommentEndpoint,
            context,
            input: {
              projectId: params.projectId,
              payload: body.comment,
            },
          })
        );
      },
    },
  },
});
