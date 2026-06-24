import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/projects/$projectId/apply-company-standards'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'applyCompanyStandardsEndpoint',
            context,
            input: params,
          })
        );
      },
    },
  },
});
