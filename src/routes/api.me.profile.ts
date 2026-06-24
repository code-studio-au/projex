import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

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
            input: await readJsonBody(request),
          })
        );
      },
    },
  },
});
