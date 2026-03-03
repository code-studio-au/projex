import { createFileRoute } from '@tanstack/react-router';
import { sql } from 'kysely';

import { withApi } from './-api-shared';
import { getDb } from '../server/db/db';
import { validateServerStartupEnv } from '../server/env';

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApi(request, async () => {
          validateServerStartupEnv();
          const db = getDb();
          await db.selectNoFrom(sql`1`.as('ok')).executeTakeFirst();
          return {
            ok: true as const,
            checks: {
              env: 'ok',
              db: 'ok',
            },
            now: new Date().toISOString(),
          };
        }),
    },
  },
});
