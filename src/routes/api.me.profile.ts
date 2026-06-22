import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import { updateCurrentUserProfileEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/me/profile')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      PATCH: async ({ request, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateCurrentUserProfileEndpoint,
            context,
            input: await readJsonBody(request),
          })
        );
      },
    },
  },
});
