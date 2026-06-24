import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

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
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'listTransactionCommentsEndpoint',
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
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'createTransactionCommentEndpoint',
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
