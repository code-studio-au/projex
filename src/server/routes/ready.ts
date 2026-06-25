import { sql } from 'kysely';

import { getDb } from '../db/db';
import { validateServerStartupEnv } from '../env';
import { checkCompanyExportStorageReady } from '../storage/exportStorageReadiness';

export async function getReadyRouteResponse(): Promise<Response> {
  validateServerStartupEnv();

  const db = getDb();
  await db.selectNoFrom(sql`1`.as('ok')).executeTakeFirst();
  await checkCompanyExportStorageReady();

  return Response.json({
    ok: true as const,
    now: new Date().toISOString(),
    checks: {
      database: true as const,
      exportStorage: true as const,
    },
  });
}
