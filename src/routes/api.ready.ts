import { createFileRoute } from '@tanstack/react-router';
import { sql } from 'kysely';

import {
  jsonApi,
  loadRouteServerExport,
  publicApiRouteMiddleware,
} from './-api-shared';

export const Route = createFileRoute('/api/ready')({
  server: {
    middleware: [publicApiRouteMiddleware],
    handlers: {
      GET: async () => {
        const [
          getDb,
          validateServerStartupEnv,
          checkCompanyExportStorageReady,
        ] = await Promise.all([
          loadRouteServerExport<
            () => {
              selectNoFrom(value: unknown): {
                executeTakeFirst(): Promise<unknown>;
              };
            }
          >('../server/db/db', 'getDb'),
          loadRouteServerExport<() => void>(
            '../server/env',
            'validateServerStartupEnv'
          ),
          loadRouteServerExport<() => Promise<void>>(
            '../server/storage/exportStorageReadiness',
            'checkCompanyExportStorageReady'
          ),
        ]);
        validateServerStartupEnv();
        const db = getDb();
        await db.selectNoFrom(sql`1`.as('ok')).executeTakeFirst();
        await checkCompanyExportStorageReady();
        return jsonApi({
          ok: true as const,
          now: new Date().toISOString(),
          checks: {
            database: true as const,
            exportStorage: true as const,
          },
        });
      },
    },
  },
});
