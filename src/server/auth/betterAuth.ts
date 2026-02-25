import type { ServerSession } from './session';
import { toServerSession } from './session';

/**
 * Minimal adapter to normalize Better Auth-like payloads into ServerSession.
 *
 * Replace `getAuthSessionFromRequest` internals when wiring real Better Auth.
 */
export async function getAuthSessionFromRequest(
  req: Request
): Promise<ServerSession | null> {
  // Placeholder: real implementation should call Better Auth server APIs.
  void req;
  return null;
}

/**
 * Utility for code paths that already have a Better Auth session payload.
 */
export function fromBetterAuthSession(source: {
  user?: { id?: string | null } | null;
  userId?: string | null;
} | null): ServerSession | null {
  return toServerSession(source);
}
