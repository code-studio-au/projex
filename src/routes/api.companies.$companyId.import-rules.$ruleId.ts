import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyId, asImportRuleId } from '../types';

export const Route = createFileRoute(
  '/api/companies/$companyId/import-rules/$ruleId'
)({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, async (api) => {
          await api.deleteImportRule(
            asCompanyId(params.companyId),
            asImportRuleId(params.ruleId)
          );

          return { ok: true as const };
        }),
    },
  },
});
