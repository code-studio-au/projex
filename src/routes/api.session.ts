import { createFileRoute } from '@tanstack/react-router';

import { apiRouteMiddleware, jsonApi } from './-api-shared';
import { resolveCurrentSession } from '../server/auth/currentSession';
import { getBetterAuthInstance } from '../server/auth/betterAuthInstance';
import { clearDevSessionSetCookie } from '../server/dev/devSession';

export const Route = createFileRoute('/api/session')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const session = await resolveCurrentSession(request);
        return jsonApi(session, {
          status: 200,
          headers: {
            'cache-control': 'no-store',
          },
        });
      },
      DELETE: async ({ request }) => {
        const auth = getBetterAuthInstance();
        const signOutResponse = await auth.api.signOut({
          headers: request.headers,
          asResponse: true,
        });

        const headers = new Headers(signOutResponse.headers);
        headers.set('cache-control', 'no-store');
        headers.append('set-cookie', clearDevSessionSetCookie());

        return new Response(signOutResponse.body, {
          status: signOutResponse.status,
          statusText: signOutResponse.statusText,
          headers,
        });
      },
    },
  },
});
