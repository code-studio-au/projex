import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import {
  createCategoryServer,
  listCategoriesServer,
  updateCategoryServer,
} from '../server/fns/taxonomy';
import {
  createCategoryInputSchema,
  updateCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/categories')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listCategoriesServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCategoryInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createCategoryServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body,
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateCategoryInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateCategoryServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            input: body,
          })
        );
      },
    },
  },
});
