import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import { createProjectInputSchema } from '../validation/apiSchemas';

export const Route = createFileRoute('/api/companies/$companyId/projects')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'listProjectsEndpoint',
            context,
            input: { companyId: params.companyId },
          })
        ),
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'createProjectEndpoint',
            context,
            input: {
              companyId: params.companyId,
              payload: await readValidatedJsonBody(
                request,
                createProjectInputSchema
              ),
            },
          })
        );
      },
    },
  },
});
