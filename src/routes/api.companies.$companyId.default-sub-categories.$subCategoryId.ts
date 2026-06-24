import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-sub-categories/$subCategoryId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/taxonomyEndpoints',
          exportName: 'deleteCompanyDefaultSubCategoryEndpoint',
          context,
          input: params,
        });

        return jsonApi({ ok: true as const });
      },
    },
  },
});
