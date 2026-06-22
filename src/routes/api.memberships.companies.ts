import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { listAllCompanyMembershipsEndpoint } from '../server/app/membershipEndpoints';

export const Route = createFileRoute('/api/memberships/companies')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listAllCompanyMembershipsEndpoint,
            context,
            input: undefined,
          })
        ),
    },
  },
});
