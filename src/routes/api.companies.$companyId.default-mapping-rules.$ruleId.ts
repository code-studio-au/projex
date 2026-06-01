import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyDefaultMappingRuleId, asCompanyId } from '../types';
import { deleteCompanyDefaultMappingRuleServer } from '../server/fns/taxonomy';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules/$ruleId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
          const { serverContext } = requireApiRouteContext(context);
          await deleteCompanyDefaultMappingRuleServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            ruleId: asCompanyDefaultMappingRuleId(params.ruleId),
          });

          return jsonApi({ ok: true as const });
        },
    },
  },
});
