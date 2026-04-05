import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getBetterAuthInstance } = await import('../server/auth/betterAuthInstance');
        const { withSecurityHeaders } = await import('../server/http/security');
        const auth = getBetterAuthInstance();
        return withSecurityHeaders(request, await auth.handler(request));
      },
      POST: async ({ request }) => {
        const { getBetterAuthInstance } = await import('../server/auth/betterAuthInstance');
        const { withSecurityHeaders } = await import('../server/http/security');
        const auth = getBetterAuthInstance();
        return withSecurityHeaders(request, await auth.handler(request));
      },
    },
  },
});
