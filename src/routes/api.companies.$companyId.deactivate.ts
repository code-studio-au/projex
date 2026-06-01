import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import { deactivateCompanyServer } from '../server/fns/companies';

export const Route = createFileRoute('/api/companies/$companyId/deactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deactivateCompanyServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
