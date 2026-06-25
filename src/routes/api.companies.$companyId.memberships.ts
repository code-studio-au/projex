import { createFileRoute } from '@tanstack/react-router';

import {
  deleteCompanyMembershipQuerySchema,
  upsertCompanyMembershipBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';
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
        const body = validateOrThrow(
          upsertCompanyMembershipBodySchema,
          await readJsonBody(request)
        );
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
        const query = validateOrThrow(
          deleteCompanyMembershipQuerySchema,
          Object.fromEntries(url.searchParams)
        );
        await executeLazyApiEndpoint({
          specifier: '../server/app/membershipEndpoints',
          exportName: 'deleteCompanyMembershipEndpoint',
          context,
          input: {
            companyId: params.companyId,
            ...query,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
