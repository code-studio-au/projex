import type { UserId } from '../../types';
import { AppError } from '../../api/errors';

/**
 * Session/auth boundary.
 *
 * In TanStack Start, replace this with Better Auth (or your preferred auth).
 * Server functions should call `requireUserId()` at the top.
 */

export type ServerSession = {
  userId: UserId;
};

export function requireUserId(session: ServerSession | null): UserId {
  if (!session) throw new AppError('UNAUTHENTICATED', 'Not authenticated');
  return session.userId;
}
