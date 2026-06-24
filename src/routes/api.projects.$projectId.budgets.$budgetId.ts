import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/budgets/$budgetId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/budgetEndpoints',
          exportName: 'deleteBudgetEndpoint',
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
