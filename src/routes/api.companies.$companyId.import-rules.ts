import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readValidatedJsonBody,
} from './-api-shared';
import {
  createImportRuleInputSchema,
  updateImportRuleInputSchema,
} from '../validation/apiSchemas';

export const Route = createFileRoute('/api/companies/$companyId/import-rules')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/importEndpoints',
            exportName: 'listImportRulesEndpoint',
            context,
            input: params,
          })
        );
      },
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/importEndpoints',
            exportName: 'createImportRuleEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                createImportRuleInputSchema
              ),
            },
          })
        );
      },
      PATCH: async ({ context, request, params }) => {
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/importEndpoints',
            exportName: 'updateImportRuleEndpoint',
            context,
            input: {
              ...params,
              payload: await readValidatedJsonBody(
                request,
                updateImportRuleInputSchema
              ),
            },
          })
        );
      },
    },
  },
});
