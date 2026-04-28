import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asCompanyId, asUserId } from '../types';
import { AppError } from '../api/errors';
import { upsertCompanyMembershipBodySchema } from '../validation/apiSchemas';
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
          const userId = url.searchParams.get('userId');
          if (!userId) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Missing userId query param'
            );
          }
          await api.deleteCompanyMembership(
            asCompanyId(params.companyId),
            asUserId(userId)
          );
          return { ok: true as const };
        }),
    },
  },
});
