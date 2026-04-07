import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';
import {
  createCategoryInputSchema,
  updateCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listCategories(asProjectId(params.projectId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(createCategoryInputSchema, await request.json());
          return api.createCategory(asProjectId(params.projectId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(updateCategoryInputSchema, await request.json());
          return api.updateCategory(asProjectId(params.projectId), body);
        }),
    },
  },
});
