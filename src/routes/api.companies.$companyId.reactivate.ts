import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { reactivateCompanyEndpoint } from '../server/app/companyEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/reactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: reactivateCompanyEndpoint,
          context,
          input: { companyId: params.companyId },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
