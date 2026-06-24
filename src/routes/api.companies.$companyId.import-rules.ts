import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

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
              payload: await readJsonBody(request),
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
              payload: await readJsonBody(request),
            },
          })
        );
      },
    },
  },
});
