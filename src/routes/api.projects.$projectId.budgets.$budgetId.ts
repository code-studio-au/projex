import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asBudgetLineId, asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/budgets/$budgetId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteBudget(asProjectId(params.projectId), asBudgetLineId(params.budgetId));
          return { ok: true as const };
        }),
    },
  },
});
