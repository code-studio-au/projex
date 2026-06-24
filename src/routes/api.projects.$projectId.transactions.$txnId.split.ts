import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

import { asTxnId } from '../types';

import { splitTxnMutationBodySchema } from '../validation/apiSchemas';

import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/split'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
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
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'splitTxnEndpoint',
            context,
            input: {
              projectId: params.projectId,
              payload: body.split,
            },
          })
        );
      },
    },
  },
});
