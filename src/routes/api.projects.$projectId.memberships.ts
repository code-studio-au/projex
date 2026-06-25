import { createFileRoute } from '@tanstack/react-router';

import {
  deleteProjectMembershipQuerySchema,
  upsertProjectMembershipBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';
import {
  apiRouteMiddleware,
  executeLazyApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';

export const Route = createFileRoute('/api/projects/$projectId/memberships')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/membershipEndpoints',
            exportName: 'listProjectMembershipsEndpoint',
            context,
            input: { projectId: params.projectId },
          })
        ),
      POST: async ({ request, params, context }) => {
        const body = validateOrThrow(
          upsertProjectMembershipBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await executeLazyApiEndpoint({
            specifier: '../server/app/membershipEndpoints',
            exportName: 'upsertProjectMembershipEndpoint',
            context,
            input: {
              projectId: params.projectId,
              ...body,
            },
          })
        );
      },
      DELETE: async ({ request, params, context }) => {
        const url = new URL(request.url);
        const query = validateOrThrow(
          deleteProjectMembershipQuerySchema,
          Object.fromEntries(url.searchParams)
        );
        await executeLazyApiEndpoint({
          specifier: '../server/app/membershipEndpoints',
          exportName: 'deleteProjectMembershipEndpoint',
          context,
          input: {
            projectId: params.projectId,
            ...query,
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
