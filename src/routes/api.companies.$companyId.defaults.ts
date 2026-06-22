import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { getCompanyDefaultsEndpoint } from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/defaults')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: getCompanyDefaultsEndpoint,
            context,
            input: params,
          })
        );
      },
    },
  },
});
