import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { applyCompanyStandardsServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/projects/$projectId/apply-company-standards'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await applyCompanyStandardsServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
    },
  },
});
