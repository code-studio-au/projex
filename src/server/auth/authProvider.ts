import type { ServerSession } from './session';
import { asUserId } from '../../types';

import { getBetterAuthInstance } from './betterAuthInstance.ts';

/**
 * Direct auth resolver hook used by `BETTER_AUTH_DIRECT_SESSION_FN`.
 *
 * Replace the body with your real BetterAuth server SDK call.
 * Return shape must contain either `userId` or `user.id`.
 */
export async function getSessionFromRequest(req: Request) {
  const auth = getBetterAuthInstance();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) return null;
  return { user: { id: session.user.id } };
}

// Optional convenience helper if your auth SDK already returns `{ userId }`.
export function toDirectSession(
  userId: string | null | undefined
): ServerSession | null {
  if (!userId) return null;
  return { userId: asUserId(userId) };
}
