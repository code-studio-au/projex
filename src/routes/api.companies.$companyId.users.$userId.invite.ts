import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId, asUserId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/users/$userId/invite')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) =>
          api.sendCompanyUserInviteEmail(
            asCompanyId(params.companyId),
            asUserId(params.userId)
          )
        ),
    },
  },
});
