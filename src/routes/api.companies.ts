import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import { createCompanyInputSchema } from '../validation/apiSchemas';

export const Route = createFileRoute('/api/companies')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'listCompaniesEndpoint',
            context,
            input: undefined,
          })
        ),
      POST: async ({ request, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'createCompanyEndpoint',
            context,
            input: await readValidatedJsonBody(
              request,
              createCompanyInputSchema
            ),
          })
        );
      },
    },
  },
});
