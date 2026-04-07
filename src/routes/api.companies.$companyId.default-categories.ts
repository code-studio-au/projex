import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';
import {
  createCompanyDefaultCategoryInputSchema,
  updateCompanyDefaultCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/default-categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listCompanyDefaultCategories(asCompanyId(params.companyId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createCompanyDefaultCategoryInputSchema,
            await request.json()
          );
          return api.createCompanyDefaultCategory(asCompanyId(params.companyId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateCompanyDefaultCategoryInputSchema,
            await request.json()
          );
          return api.updateCompanyDefaultCategory(asCompanyId(params.companyId), body);
        }),
    },
  },
});
