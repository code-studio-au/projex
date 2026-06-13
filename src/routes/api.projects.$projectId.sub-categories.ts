import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import {
  createSubCategoryServer,
  listSubCategoriesServer,
  updateSubCategoryServer,
} from '../server/fns/taxonomy';
import {
  createSubCategoryInputSchema,
  updateSubCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/sub-categories')(
  {
    server: {
      middleware: [apiRouteMiddleware],
      handlers: {
        GET: async ({ context, params }) => {
          const { serverContext } = requireApiRouteContext(context);
          return jsonApi(
            await listSubCategoriesServer({
              context: serverContext,
              projectId: asProjectId(params.projectId),
            })
          );
        },
        POST: async ({ request, params, context }) => {
          const { serverContext } = requireApiRouteContext(context);
          const body = validateOrThrow(
            createSubCategoryInputSchema,
            await readJsonBody(request)
          );
          return jsonApi(
            await createSubCategoryServer({
              context: serverContext,
              projectId: asProjectId(params.projectId),
              input: body,
            })
          );
        },
        PATCH: async ({ request, params, context }) => {
          const { serverContext } = requireApiRouteContext(context);
          const body = validateOrThrow(
            updateSubCategoryInputSchema,
            await readJsonBody(request)
          );
          return jsonApi(
            await updateSubCategoryServer({
              context: serverContext,
              projectId: asProjectId(params.projectId),
              input: body,
            })
          );
        },
      },
    },
  }
);
