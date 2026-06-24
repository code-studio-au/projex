import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute('/api/companies/$companyId')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'getCompanyEndpoint',
            context,
            input: { companyId: params.companyId },
          })
        ),
      PATCH: async ({ context, request, params }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/companyEndpoints',
            exportName: 'updateCompanyEndpoint',
            context,
            input: {
              id: params.companyId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ context, request, params }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        await executeLazyApiEndpoint({
          specifier: '../server/app/companyEndpoints',
          exportName: 'deleteCompanyEndpoint',
          context,
          input: {
            companyId: params.companyId,
            ...body,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
