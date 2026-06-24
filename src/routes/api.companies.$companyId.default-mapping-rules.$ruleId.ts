import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
} from './-api-shared';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules/$ruleId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeLazyApiEndpoint({
          specifier: '../server/app/taxonomyEndpoints',
          exportName: 'deleteCompanyDefaultMappingRuleEndpoint',
          context,
          input: params,
        });

        return jsonApi({ ok: true as const });
      },
    },
  },
});
