import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute('/api/memberships/companies')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/membershipEndpoints',
            exportName: 'listAllCompanyMembershipsEndpoint',
            context,
            input: undefined,
          })
        ),
    },
  },
});
