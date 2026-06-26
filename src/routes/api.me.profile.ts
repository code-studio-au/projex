import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import { profileUpdateBodySchema } from '../validation/apiSchemas';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      PATCH: async ({ request, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'updateCurrentUserProfileEndpoint',
            context,
            input: await readValidatedJsonBody(
              request,
              profileUpdateBodySchema
            ),
          })
        );
      },
    },
  },
});
