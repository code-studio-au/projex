import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/sub-categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listSubCategories(asProjectId(params.projectId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createSubCategory>[1];
          return api.createSubCategory(asProjectId(params.projectId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.updateSubCategory>[1];
          return api.updateSubCategory(asProjectId(params.projectId), body);
        }),
    },
  },
});
