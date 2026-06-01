import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import {
  getDefaultCompanyIdForUserServer,
} from '../server/fns/companies';

export const Route = createFileRoute('/api/me/default-company')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { session, serverContext } = requireApiRouteContext(context);
        if (!session) return jsonApi({ companyId: null });
        const companyId = await getDefaultCompanyIdForUserServer({
          context: serverContext,
        });
        return jsonApi({ companyId });
      },
    },
  },
});
