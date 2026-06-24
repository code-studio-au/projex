import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/companies/$companyId/my-project-memberships'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/membershipEndpoints',
            exportName: 'listMyProjectMembershipsEndpoint',
            context,
            input: { companyId: params.companyId },
          })
        ),
    },
  },
});
