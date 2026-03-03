import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.getProject(asProjectId(params.projectId))),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Omit<
            Parameters<typeof api.updateProject>[0],
            'id'
          >;
          return api.updateProject({
            id: asProjectId(params.projectId),
            ...body,
          });
        }),
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteProject(asProjectId(params.projectId));
          return { ok: true as const };
        }),
    },
  },
});
