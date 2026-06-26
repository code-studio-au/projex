import { getDb } from '../db/db';
import { getAuthSessionFromRequest } from './betterAuth';
import type { ServerSession } from './session';
import type { UserId } from '../../types';

export type SessionUserVerification = 'active' | 'missing' | 'disabled';

export type VerifiedCurrentSession = {
  session: ServerSession | null;
  sessionVerified: boolean;
};

export async function verifySessionUser(
  userId: UserId
): Promise<SessionUserVerification> {
  const user = await getDb()
    .selectFrom('users')
    .select(['id', 'disabled'])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) return 'missing';
  if (user.disabled) return 'disabled';
  return 'active';
}

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

  if ((await verifySessionUser(session.userId)) !== 'active') {
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
