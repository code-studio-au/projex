import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  createImportRuleEndpoint,
  listImportRulesEndpoint,
  updateImportRuleEndpoint,
} from '../server/app/importEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/import-rules')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: listImportRulesEndpoint,
            context,
            input: params,
          })
        );
      },
      POST: async ({ context, request, params }) => {
        return jsonApi(
          await executeApiEndpoint({
            endpoint: createImportRuleEndpoint,
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
          await executeApiEndpoint({
            endpoint: updateImportRuleEndpoint,
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
