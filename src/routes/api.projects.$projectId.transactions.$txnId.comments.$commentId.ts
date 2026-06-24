import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

import { asTxnCommentId } from '../types';

import { txnCommentUpdateMutationBodySchema } from '../validation/apiSchemas';

import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/comments/$commentId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      PATCH: async ({ context, request, params }) => {
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
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'updateTransactionCommentEndpoint',
            context,
            input: {
              projectId: params.projectId,
              txnId: params.txnId,
              payload: body.comment,
            },
          })
        );
      },
      DELETE: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/transactionEndpoints',
          exportName: 'deleteTransactionCommentEndpoint',
          context,
          input: {
            projectId: params.projectId,
            txnId: params.txnId,
            commentId: params.commentId,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
