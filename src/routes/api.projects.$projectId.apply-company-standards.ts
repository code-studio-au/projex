import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { applyCompanyStandardsEndpoint } from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/apply-company-standards'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: applyCompanyStandardsEndpoint,
            context,
            input: params,
          })
        );
      },
    },
  },
});
