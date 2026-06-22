import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { sendCompanyUserInviteEmailEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/users/$userId/invite'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: sendCompanyUserInviteEmailEndpoint,
            context,
            input: {
              companyId: params.companyId,
              userId: params.userId,
            },
          })
        ),
    },
  },
});
