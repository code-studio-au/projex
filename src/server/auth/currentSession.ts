import { getDb } from '../db/db';
import { getAuthSessionFromRequest } from './betterAuth';
import type { ServerSession } from './session';

export async function resolveCurrentSession(
  request: Request
): Promise<ServerSession | null> {
  const session = await getAuthSessionFromRequest(request);
  if (!session) return null;

  const user = await getDb()
    .selectFrom('users')
    .select(['id', 'disabled'])
    .where('id', '=', session.userId)
    .executeTakeFirst();

  if (!user || user.disabled) return null;
  return session;
}
