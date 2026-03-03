import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { clearDevSessionSetCookie } from '../server/dev/devSession';

export const Route = createFileRoute('/api/session')({
  server: {
    handlers: {
      GET: ({ request }) => withApi(request, (api) => api.getSession()),
      DELETE: ({ request }) =>
        withApi(request, async (api) => {
          await api.logout();
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': clearDevSessionSetCookie(),
            },
          });
        }),
    },
  },
});
