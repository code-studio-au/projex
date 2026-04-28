import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/session')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApi(request, async (api) => {
          const session = await api.getSession();
          return new Response(JSON.stringify(session), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            },
          });
        }),
      DELETE: ({ request }) =>
        withApi(request, async (api) => {
          const { clearDevSessionSetCookie } =
            await import('../server/dev/devSession');
          await api.logout();
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
              'set-cookie': clearDevSessionSetCookie(),
            },
          });
        }),
    },
  },
});
