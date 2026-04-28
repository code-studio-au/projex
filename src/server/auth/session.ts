import type { UserId } from '../../types';
import { asUserId } from '../../types';
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

/**
 * Normalizes auth session-like payloads from adapters (e.g. Better Auth).
 * Accepts either `{ userId }` or `{ user: { id } }` and returns a strict shape.
 */
export function toServerSession(
  source:
    | { userId?: string | null; user?: { id?: string | null } | null }
    | null
    | undefined
): ServerSession | null {
  const raw = source?.userId ?? source?.user?.id ?? null;
  if (!raw) return null;
  return { userId: asUserId(raw) };
}

export function requireUserId(session: ServerSession | null): UserId {
  if (!session) throw new AppError('UNAUTHENTICATED', 'Not authenticated');
  return session.userId;
}
