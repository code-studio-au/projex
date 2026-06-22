import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { cancelImportPreviewEndpoint } from '../server/app/importEndpoints';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-batches/$batchId/cancel'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: cancelImportPreviewEndpoint,
          context,
          input: {
            projectId: params.projectId,
            importBatchId: params.batchId,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
