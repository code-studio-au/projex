import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApi(request, async () => ({
          ok: true as const,
          service: 'projex',
          now: new Date().toISOString(),
        })),
    },
  },
});
