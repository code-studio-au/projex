import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asProjectId } from '../types';
import {
  createSubCategoryInputSchema,
  updateSubCategoryInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/sub-categories')(
  {
    server: {
      handlers: {
        GET: ({ request, params }) =>
          withApi(request, (api) =>
            api.listSubCategories(asProjectId(params.projectId))
          ),
        POST: async ({ request, params }) =>
          withApi(request, async (api) => {
            const body = validateOrThrow(
              createSubCategoryInputSchema,
              await readJsonBody(request)
            );
            return api.createSubCategory(asProjectId(params.projectId), body);
          }),
        PATCH: async ({ request, params }) =>
          withApi(request, async (api) => {
            const body = validateOrThrow(
              updateSubCategoryInputSchema,
              await readJsonBody(request)
            );
            return api.updateSubCategory(asProjectId(params.projectId), body);
          }),
      },
    },
  }
);
