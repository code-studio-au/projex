import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/users')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as {
            name: string;
            email: string;
            role: Parameters<typeof api.createUserInCompany>[3];
          };
          return api.createUserInCompany(
            asCompanyId(params.companyId),
            body.name,
            body.email,
            body.role
          );
        }),
    },
  },
});
