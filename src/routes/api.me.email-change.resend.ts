import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
  requireApiRouteContext,
} from './-api-shared';

export const Route = createFileRoute('/api/me/email-change/resend')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        const resendEmailChangeServer = await loadRouteServerExport<
          (args: { context: typeof serverContext }) => Promise<unknown>
        >('../server/fns/account', 'resendEmailChangeServer');
        return jsonApi(
          await resendEmailChangeServer({ context: serverContext })
        );
      },
    },
  },
});
