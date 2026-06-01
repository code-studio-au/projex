import { createFileRoute } from '@tanstack/react-router';

import { asCompanyId } from '../types';
import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { getCompanySummaryServer } from '../server/fns/companies';

export const Route = createFileRoute('/api/companies/$companyId/summary')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await getCompanySummaryServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
    },
  },
});
