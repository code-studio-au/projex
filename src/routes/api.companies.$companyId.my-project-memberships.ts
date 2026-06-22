import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { listMyProjectMembershipsEndpoint } from '../server/app/membershipEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/my-project-memberships'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listMyProjectMembershipsEndpoint,
            context,
            input: { companyId: params.companyId },
          })
        ),
    },
  },
});
