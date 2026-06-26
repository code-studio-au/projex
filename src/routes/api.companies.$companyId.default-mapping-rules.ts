import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import {
  createCompanyDefaultMappingRuleInputSchema,
  updateCompanyDefaultMappingRuleInputSchema,
} from '../validation/apiSchemas';

export const Route = createFileRoute(
  '/api/companies/$companyId/default-mapping-rules'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'listCompanyDefaultMappingRulesEndpoint',
            context,
            input: params,
          })
        );
      },
      POST: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'createCompanyDefaultMappingRuleEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                createCompanyDefaultMappingRuleInputSchema
              ),
            },
          })
        );
      },
      PATCH: async ({ request, params, context }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/taxonomyEndpoints',
            exportName: 'updateCompanyDefaultMappingRuleEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                updateCompanyDefaultMappingRuleInputSchema
              ),
            },
          })
        );
      },
    },
  },
});
