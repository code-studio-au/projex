import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { asProjectId, asUserId } from '../types';
import {
  deleteProjectMembershipServer,
  listProjectMembershipsServer,
  upsertProjectMembershipServer,
} from '../server/fns/memberships';
import {
  deleteProjectMembershipQuerySchema,
  upsertProjectMembershipBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/projects/$projectId/memberships')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listProjectMembershipsServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          upsertProjectMembershipBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await upsertProjectMembershipServer({
            context: serverContext,
            projectId: asProjectId(params.projectId),
            userId: asUserId(body.userId),
            role: body.role,
          })
        );
      },
      DELETE: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const url = new URL(request.url);
        const query = validateOrThrow(
          deleteProjectMembershipQuerySchema,
          Object.fromEntries(url.searchParams)
        );
        await deleteProjectMembershipServer({
          context: serverContext,
          projectId: asProjectId(params.projectId),
          userId: query.userId,
          role: query.role,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
