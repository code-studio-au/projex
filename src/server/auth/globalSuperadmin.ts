import type { Kysely } from 'kysely';

import type { UserId } from '../../types';
import type { DB } from '../db/schema';
import { getDb } from '../db/db';

export async function isGlobalSuperadminUser(
  userId: UserId,
  db: Kysely<DB> = getDb()
): Promise<boolean> {
  const row = await db
    .selectFrom('users')
    .select('is_global_superadmin')
    .where('id', '=', userId)
    .executeTakeFirst();
  return !!row?.is_global_superadmin;
}
