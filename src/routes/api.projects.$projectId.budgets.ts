import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/budgets')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listBudgets(asProjectId(params.projectId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createBudget>[1];
          return api.createBudget(asProjectId(params.projectId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.updateBudget>[1];
          return api.updateBudget(asProjectId(params.projectId), body);
        }),
    },
  },
});
