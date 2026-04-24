import { createFileRoute } from '@tanstack/react-router';
import { sql } from 'kysely';

import { withPublicApi } from './-api-shared';

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withPublicApi(request, async () => {
          const [{ getDb }, { validateServerStartupEnv }] = await Promise.all([
            import('../server/db/db'),
            import('../server/env'),
          ]);
          validateServerStartupEnv();
          const db = getDb();
          await db.selectNoFrom(sql`1`.as('ok')).executeTakeFirst();
          return {
            ok: true as const,
            now: new Date().toISOString(),
          };
        }),
    },
  },
});
