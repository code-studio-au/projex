import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { reactivateProjectEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/projects/$projectId/reactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: reactivateProjectEndpoint,
          context,
          input: { projectId: params.projectId },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
