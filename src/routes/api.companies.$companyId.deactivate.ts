import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute('/api/companies/$companyId/deactivate')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/companyEndpoints',
          exportName: 'deactivateCompanyEndpoint',
          context,
          input: { companyId: params.companyId },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
