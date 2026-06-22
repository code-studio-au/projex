import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { getCompanySummaryEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/summary')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: getCompanySummaryEndpoint,
            context,
            input: { companyId: params.companyId },
          })
        ),
    },
  },
});
