import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, executeApiEndpoint, jsonApi } from './-api-shared';
import { deleteImportRuleEndpoint } from '../server/app/importEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/import-rules/$ruleId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        await executeApiEndpoint({
          endpoint: deleteImportRuleEndpoint,
          context,
          input: params,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
