import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import { listMyProjectMembershipsServer } from '../server/fns/memberships';

export const Route = createFileRoute(
  '/api/companies/$companyId/my-project-memberships'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listMyProjectMembershipsServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
    },
  },
});
