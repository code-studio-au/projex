import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asBudgetLineId, asProjectId } from '../types';
import { deleteBudgetServer } from '../server/fns/budgets';

export const Route = createFileRoute(
  '/api/projects/$projectId/budgets/$budgetId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deleteBudgetServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
          budgetId: asBudgetLineId(params.budgetId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
