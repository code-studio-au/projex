import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  requireApiRouteContext,
} from './-api-shared';
import { resendEmailChangeServer } from '../server/fns/account';

export const Route = createFileRoute('/api/me/email-change/resend')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      POST: async ({ context }) => {
        const { serverContext } = requireApiRouteContext(context);
        return jsonApi(
          await resendEmailChangeServer({ context: serverContext })
        );
      },
    },
  },
});
