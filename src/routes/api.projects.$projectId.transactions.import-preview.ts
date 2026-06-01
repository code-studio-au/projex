import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { previewImportTransactionsServer } from '../server/fns/transactions';
import { asProjectId } from '../types';
import { txnImportPreviewInputSchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/projects/$projectId/transactions/import-preview'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          txnImportPreviewInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await previewImportTransactionsServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            csvText: body.csvText,
            sourceType: body.sourceType,
            fileName: body.fileName,
            autoCreateStructures: body.autoCreateStructures,
          })
        );
      },
    },
  },
});
