import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';
import {
  createCompanyDefaultSubCategoryInputSchema,
  updateCompanyDefaultSubCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/default-sub-categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listCompanyDefaultSubCategories(asCompanyId(params.companyId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createCompanyDefaultSubCategoryInputSchema,
            await request.json()
          );
          return api.createCompanyDefaultSubCategory(asCompanyId(params.companyId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateCompanyDefaultSubCategoryInputSchema,
            await request.json()
          );
          return api.updateCompanyDefaultSubCategory(asCompanyId(params.companyId), body);
        }),
    },
  },
});
