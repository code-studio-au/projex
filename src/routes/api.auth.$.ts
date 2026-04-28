import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getBetterAuthInstance } =
          await import('../server/auth/betterAuthInstance');
        const auth = getBetterAuthInstance();
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const { getBetterAuthInstance } =
          await import('../server/auth/betterAuthInstance');
        const auth = getBetterAuthInstance();
        return auth.handler(request);
      },
    },
  },
});
