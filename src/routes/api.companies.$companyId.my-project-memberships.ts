import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute(
  '/api/companies/$companyId/my-project-memberships'
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listMyProjectMemberships(asCompanyId(params.companyId))
        ),
    },
  },
});
