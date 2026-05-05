import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asCompanyId } from '../types';
import {
  deleteCompanyBodySchema,
  updateCompanyBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.getCompany(asCompanyId(params.companyId))
        ),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateCompanyBodySchema,
            await readJsonBody(request)
          );
          return api.updateCompany({
            id: asCompanyId(params.companyId),
            ...body,
          });
        }),
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            deleteCompanyBodySchema,
            await readJsonBody(request)
          );
          await api.deleteCompany({
            companyId: asCompanyId(params.companyId),
            confirmation: body.confirmation,
          });
          return { ok: true as const };
        }),
    },
  },
});
