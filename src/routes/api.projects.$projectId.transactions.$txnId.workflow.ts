import { createFileRoute } from '@tanstack/react-router';

import { AppError } from '../api/errors';
import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asTxnId } from '../types';
import { updateTxnWorkflowStateServer } from '../server/fns/transactions';
import { txnWorkflowStateMutationBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/$txnId/workflow'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
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
          await updateTxnWorkflowStateServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body.workflow,
          })
        );
      },
    },
  },
});
