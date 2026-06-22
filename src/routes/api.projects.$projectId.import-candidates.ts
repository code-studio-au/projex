import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { listImportCandidatesEndpoint } from '../server/app/importEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-candidates'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: listImportCandidatesEndpoint,
            context,
            input: params,
          })
        );
      },
    },
  },
});
