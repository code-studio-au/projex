import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { readJsonBody, withApi } from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { txnCommentMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/comments'
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listTransactionComments(
            asProjectId(params.projectId),
            asTxnId(params.txnId)
          )
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
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
          return api.createTransactionComment(
            asProjectId(params.projectId),
            body.comment
          );
        }),
    },
  },
});
