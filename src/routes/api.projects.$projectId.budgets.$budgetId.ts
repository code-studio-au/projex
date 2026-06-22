import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteBudgetEndpoint } from '../server/app/budgetEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/budgets/$budgetId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteBudgetEndpoint,
          context,
          input: {
            projectId: params.projectId,
            budgetId: params.budgetId,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
