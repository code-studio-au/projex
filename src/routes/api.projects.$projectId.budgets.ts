import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createBudgetEndpoint,
  listBudgetsEndpoint,
  updateBudgetEndpoint,
} from '../server/app/budgetEndpoints';

export const Route = createFileRoute('/api/projects/$projectId/budgets')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listBudgetsEndpoint,
            context,
            input: { projectId: params.projectId },
          })
        ),
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createBudgetEndpoint,
            context,
            input: {
              projectId: params.projectId,
              payload: await readJsonBody(request),
            },
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateBudgetEndpoint,
            context,
            input: {
              projectId: params.projectId,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
