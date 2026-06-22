import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteSubCategoryEndpoint } from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/sub-categories/$subCategoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteSubCategoryEndpoint,
          context,
          input: params,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
