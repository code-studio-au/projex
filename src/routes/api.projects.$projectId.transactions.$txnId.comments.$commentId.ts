import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asTxnCommentId, asTxnId } from '../types';
import {
  deleteTransactionCommentServer,
  updateTransactionCommentServer,
} from '../server/fns/transactionComments';
import { txnCommentUpdateMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/comments/$commentId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      PATCH: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          txnCommentUpdateMutationBodySchema,
          await readJsonBody(request)
        );
        const commentId = asTxnCommentId(params.commentId);
        if (body.comment.id !== commentId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Transaction comment id does not match route'
          );
        }
        return jsonApi(
          await updateTransactionCommentServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            txnId: asTxnId(params.txnId),
            input: body.comment,
          })
        );
      },
      DELETE: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deleteTransactionCommentServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
          txnId: asTxnId(params.txnId),
          commentId: asTxnCommentId(params.commentId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
