import { createFileRoute } from '@tanstack/react-router';

import { getBetterAuthInstance } from '../server/auth/betterAuthInstance';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const auth = getBetterAuthInstance();
        return auth.handler(request);
      },
      POST: ({ request }) => {
        const auth = getBetterAuthInstance();
        return auth.handler(request);
      },
    },
  },
});
