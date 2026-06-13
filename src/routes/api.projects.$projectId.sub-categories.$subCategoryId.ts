import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asSubCategoryId } from '../types';
import { deleteSubCategoryServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/projects/$projectId/sub-categories/$subCategoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deleteSubCategoryServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
          subCategoryId: asSubCategoryId(params.subCategoryId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
