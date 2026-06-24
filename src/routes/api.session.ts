import { createFileRoute } from '@tanstack/react-router';

import {
  apiRouteMiddleware,
  jsonApi,
  loadRouteServerExport,
} from './-api-shared';

export const Route = createFileRoute('/api/session')({
  server: {
    middleware: [apiRouteMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const resolveCurrentSession = await loadRouteServerExport<
          (request: Request) => Promise<unknown>
        >('../server/auth/currentSession', 'resolveCurrentSession');
        const session = await resolveCurrentSession(request);
        return jsonApi(session, {
          status: 200,
          headers: {
            'cache-control': 'no-store',
          },
        });
      },
      DELETE: async ({ request }) => {
        const getBetterAuthInstance = await loadRouteServerExport<
          () => {
            api: {
              signOut(args: {
                headers: Headers;
                asResponse: true;
              }): Promise<Response>;
            };
          }
        >('../server/auth/betterAuthInstance', 'getBetterAuthInstance');
        const clearDevSessionSetCookie = await loadRouteServerExport<
          () => string
        >('../server/dev/devSession', 'clearDevSessionSetCookie');
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
