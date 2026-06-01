import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId } from '../types';
import { applyCompanyDefaultTaxonomyServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/projects/$projectId/apply-company-default-taxonomy'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await applyCompanyDefaultTaxonomyServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
    },
  },
});
