import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { listAllCompanyMembershipsServer } from '../server/fns/memberships';

export const Route = createFileRoute('/api/memberships/companies')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listAllCompanyMembershipsServer({ context: serverContext })
        );
      },
    },
  },
});
