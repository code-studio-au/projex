import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteCompanyDefaultCategoryEndpoint } from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-categories/$categoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteCompanyDefaultCategoryEndpoint,
          context,
          input: params,
        });

        return jsonApi({ ok: true as const });
      },
    },
  },
});
