import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createCompanyEndpoint,
  listCompaniesEndpoint,
} from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/companies')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listCompaniesEndpoint,
            context,
            input: undefined,
          })
        ),
      POST: async ({ request, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createCompanyEndpoint,
            context,
            input: await readJsonBody(request),
          })
        );
      },
    },
  },
});
