import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute('/api/projects/$projectId/deactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/companyEndpoints',
          exportName: 'deactivateProjectEndpoint',
          context,
          input: { projectId: params.projectId },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
