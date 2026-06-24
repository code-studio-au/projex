import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-categories/$categoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/taxonomyEndpoints',
          exportName: 'deleteCompanyDefaultCategoryEndpoint',
          context,
          input: params,
        });

        return jsonApi({ ok: true as const });
      },
    },
  },
});
