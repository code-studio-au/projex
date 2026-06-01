import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import {
  createTransactionCommentServer,
  listTransactionCommentsServer,
} from '../server/fns/transactionComments';
import { txnCommentMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/comments'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listTransactionCommentsServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            txnId: asTxnId(params.txnId),
          })
        );
      },
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
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
          await createTransactionCommentServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body.comment,
          })
        );
      },
    },
  },
});
