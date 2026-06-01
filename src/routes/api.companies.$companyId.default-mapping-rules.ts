import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId } from '../types';
import {
  createCompanyDefaultMappingRuleServer,
  listCompanyDefaultMappingRulesServer,
  updateCompanyDefaultMappingRuleServer,
} from '../server/fns/taxonomy';
import {
  createCompanyDefaultMappingRuleInputSchema,
  updateCompanyDefaultMappingRuleInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listCompanyDefaultMappingRulesServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          createCompanyDefaultMappingRuleInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await createCompanyDefaultMappingRuleServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          updateCompanyDefaultMappingRuleInputSchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await updateCompanyDefaultMappingRuleServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            input: body,
          })
        );
      },
    },
  },
});
