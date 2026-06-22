import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  deleteCompanyMembershipEndpoint,
  listCompanyMembershipsEndpoint,
  upsertCompanyMembershipEndpoint,
} from '../server/app/membershipEndpoints';

export const Route = createFileRoute('/api/companies/$companyId/memberships')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listCompanyMembershipsEndpoint,
            context,
            input: { companyId: params.companyId },
          })
        ),
      POST: async ({ request, params, context }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        return jsonApi(
          await executeApiEndpoint({
            endpoint: upsertCompanyMembershipEndpoint,
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
        await executeApiEndpoint({
          endpoint: deleteCompanyMembershipEndpoint,
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
