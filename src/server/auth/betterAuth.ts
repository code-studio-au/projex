import type { ServerSession } from './session';
import { toServerSession } from './session';
import { readDevUserIdFromRequest } from '../dev/devSession';

/**
 * Resolve the current user session directly through Better Auth.
 */
export async function getAuthSessionFromRequest(
  req: Request
): Promise<ServerSession | null> {
  try {
    const { getBetterAuthInstance } = await import('./betterAuthInstance');
    const auth = getBetterAuthInstance();
    const session = await auth.api.getSession({ headers: req.headers });
    const normalized = toServerSession(session);
    if (normalized) return normalized;
  } catch (err) {
    console.error('[auth] better-auth session resolution failed', err);
  }

  // Dev-only fallback session for local server-mode auth flows.
  const devUserId = readDevUserIdFromRequest(req);
  if (devUserId) return { userId: devUserId };

  return null;
}

/**
 * Utility for code paths that already have a Better Auth session payload.
 */
export function fromBetterAuthSession(
  source: {
    user?: { id?: string | null } | null;
    userId?: string | null;
  } | null
): ServerSession | null {
  return toServerSession(source);
}
