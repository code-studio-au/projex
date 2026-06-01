import { createFileRoute } from '@tanstack/react-router';

import { jsonApi, publicApiRouteMiddleware } from './-api-shared';

export const Route = createFileRoute('/api/health')({
  server: {
    middleware: [publicApiRouteMiddleware],
    handlers: {
      GET: () =>
        jsonApi({
          ok: true as const,
          service: 'projex',
          now: new Date().toISOString(),
        }),
    },
  },
});
