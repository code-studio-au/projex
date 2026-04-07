import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';
import { updateCompanyBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.getCompany(asCompanyId(params.companyId))),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(updateCompanyBodySchema, await request.json());
          return api.updateCompany({
            id: asCompanyId(params.companyId),
            ...body,
          });
        }),
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteCompany(asCompanyId(params.companyId));
          return { ok: true as const };
        }),
    },
  },
});
