import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asCompanyId } from '../types';
import { createProjectInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/projects')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listProjects(asCompanyId(params.companyId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createProjectInputSchema,
            await readJsonBody(request)
          );
          return api.createProject(asCompanyId(params.companyId), body);
        }),
    },
  },
});
