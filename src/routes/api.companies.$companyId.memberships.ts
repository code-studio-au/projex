import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asCompanyId, asUserId } from '../types';
import {
  deleteCompanyMembershipQuerySchema,
  upsertCompanyMembershipBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/memberships')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listCompanyMemberships(asCompanyId(params.companyId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            upsertCompanyMembershipBodySchema,
            await readJsonBody(request)
          );
          return api.upsertCompanyMembership(
            asCompanyId(params.companyId),
            asUserId(body.userId),
            body.role
          );
        }),
      DELETE: async ({ request, params }) =>
        withApi(request, async (api) => {
          const url = new URL(request.url);
          const query = validateOrThrow(
            deleteCompanyMembershipQuerySchema,
            Object.fromEntries(url.searchParams)
          );
          await api.deleteCompanyMembership(
            asCompanyId(params.companyId),
            query.userId
          );
          return { ok: true as const };
        }),
    },
  },
});
