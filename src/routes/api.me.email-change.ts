import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { emailChangeRequestBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const getPendingEmailChangeServer = await loadRouteServerExport<
          (args: { context: typeof serverContext }) => Promise<unknown>
        >('../server/fns/account', 'getPendingEmailChangeServer');
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
        const requestEmailChangeServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            input: { newEmail: string };
          }) => Promise<unknown>
        >('../server/fns/account', 'requestEmailChangeServer');
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
        const cancelEmailChangeServer = await loadRouteServerExport<
          (args: { context: typeof serverContext }) => Promise<void>
        >('../server/fns/account', 'cancelEmailChangeServer');
        await cancelEmailChangeServer({ context: serverContext });
        return jsonApi({ ok: true });
      },
    },
  },
});
