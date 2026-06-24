import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
  requireApiRouteContext,
} from './-api-shared';

export const Route = createFileRoute('/api/me/default-company')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { session, serverContext } = requireApiRouteContext(context);
        if (!session) return jsonApi({ companyId: null });
        const getDefaultCompanyIdForUserServer = await loadRouteServerExport<
          (args: { context: typeof serverContext }) => Promise<string | null>
        >('../server/fns/companies', 'getDefaultCompanyIdForUserServer');
        const companyId = await getDefaultCompanyIdForUserServer({
          context: serverContext,
        });
        return jsonApi({ companyId });
      },
    },
  },
});
