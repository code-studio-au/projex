import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { readJsonBody, withApi } from './-api-shared';
import { asProjectId, asTxnCommentId, asTxnId } from '../types';
import { txnCommentUpdateMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/comments/$commentId'
)({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
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
          return api.updateTransactionComment(
            asProjectId(params.projectId),
            asTxnId(params.txnId),
            body.comment
          );
        }),
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteTransactionComment(
            asProjectId(params.projectId),
            asTxnId(params.txnId),
            asTxnCommentId(params.commentId)
          );
          return { ok: true as const };
        }),
    },
  },
});
