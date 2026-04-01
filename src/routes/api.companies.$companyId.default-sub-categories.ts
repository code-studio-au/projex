import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/default-sub-categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listCompanyDefaultSubCategories(asCompanyId(params.companyId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createCompanyDefaultSubCategory>[1];
          return api.createCompanyDefaultSubCategory(asCompanyId(params.companyId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.updateCompanyDefaultSubCategory>[1];
          return api.updateCompanyDefaultSubCategory(asCompanyId(params.companyId), body);
        }),
    },
  },
});
