import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asProjectId } from '../types';
import {
  createBudgetInputSchema,
  updateBudgetInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/budgets')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listBudgets(asProjectId(params.projectId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createBudgetInputSchema,
            await readJsonBody(request)
          );
          return api.createBudget(asProjectId(params.projectId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateBudgetInputSchema,
            await readJsonBody(request)
          );
          return api.updateBudget(asProjectId(params.projectId), body);
        }),
    },
  },
});
