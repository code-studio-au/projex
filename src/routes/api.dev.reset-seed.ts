import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';

export const Route = createFileRoute('/api/dev/reset-seed')({
  server: {
    handlers: {
      POST: ({ request }) =>
        withApi(request, async () => {
          const [{ resetDatabaseToSeed }, { assertDevEndpointsEnabled }] = await Promise.all([
            import('../server/dev/resetSeed'),
            import('../server/dev/devSession'),
          ]);
          assertDevEndpointsEnabled();
          await resetDatabaseToSeed();
          return { ok: true as const };
        }),
    },
  },
});
