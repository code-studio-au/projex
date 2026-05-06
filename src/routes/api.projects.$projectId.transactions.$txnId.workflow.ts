import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import { readJsonBody, withApi } from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { txnWorkflowStateMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/workflow'
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
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
          return api.updateTxnWorkflowState(
            asProjectId(params.projectId),
            body.workflow
          );
        }),
    },
  },
});
