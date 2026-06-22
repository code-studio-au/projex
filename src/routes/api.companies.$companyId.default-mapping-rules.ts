import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createCompanyDefaultMappingRuleEndpoint,
  listCompanyDefaultMappingRulesEndpoint,
  updateCompanyDefaultMappingRuleEndpoint,
} from '../server/app/taxonomyEndpoints';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: listCompanyDefaultMappingRulesEndpoint,
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createCompanyDefaultMappingRuleEndpoint,
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: updateCompanyDefaultMappingRuleEndpoint,
            context,
            input: {
              ...params,
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
