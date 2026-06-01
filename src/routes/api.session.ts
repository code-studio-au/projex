import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, jsonApi, requireApiRouteContext } from './-api-shared';

export const Route = createFileRoute('/api/session')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ context }) => {
        const { session } = requireApiRouteContext(context);
        return jsonApi(session, {
          status: 200,
          headers: {
            'cache-control': 'no-store',
          },
        });
      },
      DELETE: async () => {
        const { clearDevSessionSetCookie } =
          await import('../server/dev/devSession');
        return jsonApi({ ok: true }, {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'set-cookie': clearDevSessionSetCookie(),
          },
        });
      },
    },
  },
});
