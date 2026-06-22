import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  executeApiEndpoint,
  jsonApi,
  readJsonBody,
} from './-api-shared';
import {
  deleteProjectMembershipEndpoint,
  listProjectMembershipsEndpoint,
  upsertProjectMembershipEndpoint,
} from '../server/app/membershipEndpoints';

export const Route = createFileRoute('/api/projects/$projectId/memberships')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) =>
        jsonApi(
          await executeApiEndpoint({
            endpoint: listProjectMembershipsEndpoint,
            context,
            input: { projectId: params.projectId },
          })
        ),
      POST: async ({ request, params, context }) => {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        return jsonApi(
          await executeApiEndpoint({
            endpoint: upsertProjectMembershipEndpoint,
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
        await executeApiEndpoint({
          endpoint: deleteProjectMembershipEndpoint,
          context,
          input: {
            projectId: params.projectId,
            ...Object.fromEntries(url.searchParams),
          },
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
