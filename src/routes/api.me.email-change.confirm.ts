import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
  readJsonBody,
  requireApiRouteContext,
} from './-api-shared';
import { emailChangeConfirmBodySchema } from '../validation/apiSchemas';
import { validateOrThrow } from '../validation/validate';

export const Route = createFileRoute('/api/me/email-change/confirm')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const body = validateOrThrow(
          emailChangeConfirmBodySchema,
          await readJsonBody(request)
        );
        const confirmEmailChangeServer = await loadRouteServerExport<
          (args: {
            context: typeof serverContext;
            token: string;
          }) => Promise<unknown>
        >('../server/fns/account', 'confirmEmailChangeServer');
        return jsonApi(
          await confirmEmailChangeServer({
            context: serverContext,
            token: body.token,
          })
        );
      },
    },
  },
});
