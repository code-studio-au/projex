import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/default-categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listCompanyDefaultCategories(asCompanyId(params.companyId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createCompanyDefaultCategory>[1];
          return api.createCompanyDefaultCategory(asCompanyId(params.companyId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.updateCompanyDefaultCategory>[1];
          return api.updateCompanyDefaultCategory(asCompanyId(params.companyId), body);
        }),
    },
  },
});
