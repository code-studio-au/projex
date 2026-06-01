import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { asCompanyId, asUserId } from '../types';
import { sendCompanyUserInviteEmailServer } from '../server/fns/companies';

export const Route = createFileRoute(
  '/api/companies/$companyId/users/$userId/invite'
)({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context, params }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await sendCompanyUserInviteEmailServer({
            context: serverContext,
            companyId: asCompanyId(params.companyId),
            userId: asUserId(params.userId),
          })
        );
      },
    },
  },
});
