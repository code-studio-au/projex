import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import {
  createBudgetServer,
  listBudgetsServer,
  updateBudgetServer,
} from '../server/fns/budgets';
import {
  createBudgetInputSchema,
  updateBudgetInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/budgets')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listBudgetsServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
      POST: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createBudgetInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createBudgetServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body,
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateBudgetInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateBudgetServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body,
          })
        );
      },
    },
  },
});
