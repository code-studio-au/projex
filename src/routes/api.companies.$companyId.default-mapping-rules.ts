import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/default-mapping-rules')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listCompanyDefaultMappingRules(asCompanyId(params.companyId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<
            typeof api.createCompanyDefaultMappingRule
          >[1];
          return api.createCompanyDefaultMappingRule(asCompanyId(params.companyId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<
            typeof api.updateCompanyDefaultMappingRule
          >[1];
          return api.updateCompanyDefaultMappingRule(asCompanyId(params.companyId), body);
        }),
    },
  },
});
