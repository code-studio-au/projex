import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { listImportCandidatesServer } from '../server/fns/transactions';

export const Route = createFileRoute(
  '/api/projects/$projectId/import-candidates'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listImportCandidatesServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
    },
  },
});
