import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteCategoryEndpoint } from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/categories/$categoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteCategoryEndpoint,
          context,
          input: params,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
