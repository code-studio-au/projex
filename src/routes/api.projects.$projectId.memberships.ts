import { createFileRoute } from '@tanstack/react-router';

import { readJsonBody, withApi } from './-api-shared';
import { asProjectId, asUserId } from '../types';
import { AppError } from '../api/errors';
import { upsertProjectMembershipBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/memberships')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApi(request, (api) =>
          api.listProjectMemberships(asProjectId(params.projectId))
        ),
      POST: async ({ request, params }) =>
        withApi(request, async (api) => {
          const body = validateOrThrow(
            upsertProjectMembershipBodySchema,
            await readJsonBody(request)
          );
          return api.upsertProjectMembership(
            asProjectId(params.projectId),
            asUserId(body.userId),
            body.role
          );
        }),
      DELETE: async ({ request, params }) =>
        withApi(request, async (api) => {
          const url = new URL(request.url);
          const userId = url.searchParams.get('userId');
          const role = url.searchParams.get('role') as
            | Parameters<typeof api.deleteProjectMembership>[2]
            | null;
          if (!userId || !role) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Missing userId or role query param'
            );
          }
          await api.deleteProjectMembership(
            asProjectId(params.projectId),
            asUserId(userId),
            role
          );
          return { ok: true as const };
        }),
    },
  },
});
