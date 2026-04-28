import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { createCompanyInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies')({
  server: {
    handlers: {
      GET: ({ request }) => withApi(request, (api) => api.listCompanies()),
      POST: async ({ request }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createCompanyInputSchema,
            await readJsonBody(request)
          );
          return api.createCompany(body);
        }),
    },
  },
});
