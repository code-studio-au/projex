import { getDb } from '../db/db';
import { getAuthSessionFromRequest } from './betterAuth';
import type { ServerSession } from './session';

export type VerifiedCurrentSession = {
  session: ServerSession | null;
  sessionVerified: boolean;
};

export async function resolveVerifiedCurrentSession(
  request: Request
): Promise<VerifiedCurrentSession> {
  const session = await getAuthSessionFromRequest(request);
  if (!session) {
    return {
      session: null,
      sessionVerified: false,
    };
  }

  const user = await getDb()
    .selectFrom('users')
    .select(['id', 'disabled'])
    .where('id', '=', session.userId)
    .executeTakeFirst();

  if (!user || user.disabled) {
    return {
      session: null,
      sessionVerified: false,
    };
  }

  return {
    session,
    sessionVerified: true,
  };
}

export async function resolveCurrentSession(
  request: Request
): Promise<ServerSession | null> {
  const { session } = await resolveVerifiedCurrentSession(request);
  return session;
}
