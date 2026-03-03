import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId/categories')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listCategories(asProjectId(params.projectId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createCategory>[1];
          return api.createCategory(asProjectId(params.projectId), body);
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.updateCategory>[1];
          return api.updateCategory(asProjectId(params.projectId), body);
        }),
    },
  },
});
