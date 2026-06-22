import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import { createUserInCompanyEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/users')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createUserInCompanyEndpoint,
            context,
            input: {
              companyId: params.companyId,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
