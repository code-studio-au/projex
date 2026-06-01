import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCategoryId, asProjectId } from '../types';
import { deleteCategoryServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/projects/$projectId/categories/$categoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
          const { serverContext } = requireApiRouteContext(context);
          await deleteCategoryServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            categoryId: asCategoryId(params.categoryId),
          });
          return jsonApi({ ok: true as const });
        },
    },
  },
});
