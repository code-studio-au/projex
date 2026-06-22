import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteCompanyDefaultMappingRuleEndpoint } from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules/$ruleId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteCompanyDefaultMappingRuleEndpoint,
          context,
          input: params,
        });

        return jsonApi({ ok: true as const });
      },
    },
  },
});
