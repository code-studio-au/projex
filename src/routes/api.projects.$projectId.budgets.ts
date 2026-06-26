import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import {
  createBudgetInputSchema,
  updateBudgetInputSchema,
} from '../validation/apiSchemas';

export const Route = createFileRoute('/api/projects/$projectId/budgets')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/budgetEndpoints',
            exportName: 'listBudgetsEndpoint',
            context,
            input: { projectId: params.projectId },
          })
        ),
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/budgetEndpoints',
            exportName: 'createBudgetEndpoint',
            context,
            input: {
              projectId: params.projectId,
              payload: await readValidatedJsonBody(
                request,
                createBudgetInputSchema
              ),
            },
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/budgetEndpoints',
            exportName: 'updateBudgetEndpoint',
            context,
            input: {
              projectId: params.projectId,
              payload: await readValidatedJsonBody(
                request,
                updateBudgetInputSchema
              ),
            },
          })
        );
      },
    },
  },
});
