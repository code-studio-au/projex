import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/companies')({
  server: {
    handlers: {
      GET: ({ request }) => withApi(request, (api) => api.listCompanies()),
      POST: async ({ request }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createCompany>[0];
          return api.createCompany(body);
        }),
    },
  },
});
