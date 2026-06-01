import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { listUsersServer } from '../server/fns/companies';

export const Route = createFileRoute('/api/users')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(await listUsersServer({ context: serverContext }));
      },
    },
  },
});
