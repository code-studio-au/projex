import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asCompanyId } from '../types';
import {
  createCompanyDefaultMappingRuleInputSchema,
  updateCompanyDefaultMappingRuleInputSchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules'
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listCompanyDefaultMappingRules(asCompanyId(params.companyId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            createCompanyDefaultMappingRuleInputSchema,
            await readJsonBody(request)
          );
          return api.createCompanyDefaultMappingRule(
            asCompanyId(params.companyId),
            body
          );
        }),
      PATCH: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            updateCompanyDefaultMappingRuleInputSchema,
            await readJsonBody(request)
          );
          return api.updateCompanyDefaultMappingRule(
            asCompanyId(params.companyId),
            body
          );
        }),
    },
  },
});
