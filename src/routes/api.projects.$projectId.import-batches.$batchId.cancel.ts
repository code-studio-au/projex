import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asProjectId } from '../types';
import { importBatchIdParamSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-batches/$batchId/cancel'
)({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          await api.cancelImportPreview(
            asProjectId(params.projectId),
            validateOrThrow(importBatchIdParamSchema, params.batchId)
          );
          return { ok: true as const };
        }),
    },
  },
});
