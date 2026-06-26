import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import { createCompanyUserBodySchema } from '../validation/apiSchemas';

export const Route = createFileRoute('/api/companies/$companyId/users')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'createUserInCompanyEndpoint',
            context,
            input: {
              companyId: params.companyId,
              payload: await readValidatedJsonBody(
                request,
                createCompanyUserBodySchema
              ),
            },
          })
        );
      },
    },
  },
});
