import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createProjectEndpoint,
  listProjectsEndpoint,
} from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/projects')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listProjectsEndpoint,
            context,
            input: { companyId: params.companyId },
          })
        ),
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createProjectEndpoint,
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
