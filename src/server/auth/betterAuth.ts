import type { ServerSession } from './session';
import { toServerSession } from './session';
import { readDevUserIdFromRequest } from '../dev/devSession';
import { logServerEvent } from '../../api/serverLogging.ts';

/**
 * Resolve the current user session directly through Better Auth.
 */
export async function getAuthSessionFromRequest(
  req: Request,
  requestId?: string
): Promise<ServerSession | null> {
  try {
    const { getBetterAuthInstance } = await import('./betterAuthInstance');
    const auth = getBetterAuthInstance();
    const session = await auth.api.getSession({ headers: req.headers });
    const normalized = toServerSession(session);
    if (normalized) return normalized;
  } catch (err) {
    const url = new URL(req.url);
    logServerEvent({
      level: 'error',
      event: 'auth_session_resolution_failed',
      error: err,
      fields: {
        requestId: requestId ?? req.headers.get('x-request-id') ?? undefined,
        method: req.method,
        path: url.pathname,
      },
    });
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
