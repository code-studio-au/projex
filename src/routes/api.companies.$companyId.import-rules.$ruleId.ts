import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId, asImportRuleId } from '../types';
import { deleteImportRuleServer } from '../server/fns/importRules';

export const Route = createFileRoute(
  '/api/companies/$companyId/import-rules/$ruleId'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      DELETE: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        await deleteImportRuleServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
          ruleId: asImportRuleId(params.ruleId),
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
