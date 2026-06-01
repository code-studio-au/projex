import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import {
  deleteCompanyMembershipServer,
  listCompanyMembershipsServer,
  upsertCompanyMembershipServer,
} from '../server/fns/memberships';
import { asCompanyId, asUserId } from '../types';
import {
  deleteCompanyMembershipQuerySchema,
  upsertCompanyMembershipBodySchema,
} from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/companies/$companyId/memberships')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await listCompanyMembershipsServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
          })
        );
      },
      POST: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          upsertCompanyMembershipBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await upsertCompanyMembershipServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            userId: asUserId(body.userId),
            role: body.role,
          })
        );
      },
      DELETE: async ({ request, params, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const url = new URL(request.url);
        const query = validateOrThrow(
          deleteCompanyMembershipQuerySchema,
          Object.fromEntries(url.searchParams)
        );
        await deleteCompanyMembershipServer({
          context: serverContext,
          companyId: asCompanyId(params.companyId),
          userId: query.userId,
        });
        return jsonApi({ ok: true as const });
      },
    },
  },
});
