import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { asCompanyDefaultMappingRuleId, asCompanyId } from '../types';

export const Route = createFileRoute('/api/companies/$companyId/default-mapping-rules/$ruleId')({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        withApi(request, (api) =>
          api.deleteCompanyDefaultMappingRule(
            asCompanyId(params.companyId),
            asCompanyDefaultMappingRuleId(params.ruleId)
          )
        ),
    },
  },
});
