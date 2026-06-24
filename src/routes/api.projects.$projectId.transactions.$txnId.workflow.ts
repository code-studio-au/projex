import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

import { asTxnId } from '../types';

import { txnWorkflowStateMutationBodySchema } from '../validation/apiSchemas';

import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/workflow'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        const body = validateOrThrow(
          txnWorkflowStateMutationBodySchema,
          await readJsonBody(request)
        );
        const txnId = asTxnId(params.txnId);
        if (body.workflow.txnId !== txnId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Transaction workflow txnId does not match route'
          );
        }
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/transactionEndpoints',
            exportName: 'updateTxnWorkflowStateEndpoint',
            context,
            input: {
              projectId: params.projectId,
              payload: body.workflow,
            },
          })
        );
      },
    },
  },
});
