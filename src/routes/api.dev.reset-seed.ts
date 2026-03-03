import { createFileRoute } from '@tanstack/react-router';

import { withApi } from './-api-shared';
import { resetDatabaseToSeed } from '../server/dev/resetSeed';
import { assertDevEndpointsEnabled } from '../server/dev/devSession';

export const Route = createFileRoute('/api/dev/reset-seed')({
  server: {
    handlers: {
      POST: ({ request }) =>
        withApi(request, async () => {
          assertDevEndpointsEnabled();
          await resetDatabaseToSeed();
          return { ok: true as const };
        }),
    },
  },
});
