import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { getCompanyDefaultsServer } from '../server/fns/taxonomy';

export const Route = createFileRoute('/api/companies/$companyId/defaults')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await getCompanyDefaultsServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
    },
  },
});
