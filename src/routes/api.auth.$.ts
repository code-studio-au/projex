import { createFileRoute } from '@tanstack/react-router';
import { loadRouteServerExport, publicApiRouteMiddleware } from './-api-shared';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    middleware: [publicApiRouteMiddleware],
    handlers: {
      GET: async ({ request }) => {
        const getBetterAuthInstance = await loadRouteServerExport<
          () => { handler(request: Request): Promise<Response> }
        >('../server/auth/betterAuthInstance', 'getBetterAuthInstance');
        const auth = getBetterAuthInstance();
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const getBetterAuthInstance = await loadRouteServerExport<
          () => { handler(request: Request): Promise<Response> }
        >('../server/auth/betterAuthInstance', 'getBetterAuthInstance');
        const auth = getBetterAuthInstance();
        return auth.handler(request);
      },
    },
  },
});
