import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute('/api/companies/$companyId/memberships')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/membershipEndpoints',
            exportName: 'listCompanyMembershipsEndpoint',
            context,
            input: { companyId: params.companyId },
          })
        ),
      POST: async ({ request, params, context }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/membershipEndpoints',
            exportName: 'upsertCompanyMembershipEndpoint',
            context,
            input: {
              companyId: params.companyId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ request, params, context }) => {
        const url = new URL(request.url);
        await executeLazyApiEndpoint({
          specifier: '../server/app/membershipEndpoints',
          exportName: 'deleteCompanyMembershipEndpoint',
          context,
          input: {
            companyId: params.companyId,
            ...Object.fromEntries(url.searchParams),
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
