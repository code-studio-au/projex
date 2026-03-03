import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/projects')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) => api.listProjects(asCompanyId(params.companyId))),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = (await request.json()) as Parameters<typeof api.createProject>[1];
          return api.createProject(asCompanyId(params.companyId), body);
        }),
    },
  },
});
