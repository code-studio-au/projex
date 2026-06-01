import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { importTransactionsServer } from '../server/fns/transactions';
import { txnImportInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/import'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          txnImportInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await importTransactionsServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            txns: body.txns,
            mode: body.mode,
            autoCreateBudgets: body.autoCreateBudgets,
          })
        );
      },
    },
  },
});
