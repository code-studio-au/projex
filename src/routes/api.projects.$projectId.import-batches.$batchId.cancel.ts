import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { cancelImportPreviewServer } from '../server/fns/transactions';
import { importBatchIdParamSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-batches/$batchId/cancel'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
          await cancelImportPreviewServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            importBatchId: validateOrThrow(importBatchIdParamSchema, params.batchId),
          });
          return jsonApi({ ok: true as const });
        },
    },
  },
});
