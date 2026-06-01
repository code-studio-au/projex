import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import {
  cancelEmailChangeServer,
  getPendingEmailChangeServer,
  requestEmailChangeServer,
} from '../server/fns/account';
import { emailChangeRequestBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await getPendingEmailChangeServer({ context: serverContext })
        );
      },
      POST: async ({ request, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          emailChangeRequestBodySchema,
          await readJsonBody(request)
        );
        return jsonApi(
          await requestEmailChangeServer({
            context: serverContext,
            input: {
              newEmail: body.newEmail,
            },
          })
        );
      },
      DELETE: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        await cancelEmailChangeServer({ context: serverContext });
        return jsonApi({ ok: true });
      },
    },
  },
});
