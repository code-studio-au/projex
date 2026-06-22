import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { listUsersEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/users')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listUsersEndpoint,
            context,
            input: undefined,
          })
        ),
    },
  },
});
