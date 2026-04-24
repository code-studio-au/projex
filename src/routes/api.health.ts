import { createFileRoute } from '@tanstack/react-router';

import { withPublicApi } from './-api-shared';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withPublicApi(request, async () => ({
          ok: true as const,
          service: 'projex',
          now: new Date().toISOString(),
        })),
    },
  },
});
