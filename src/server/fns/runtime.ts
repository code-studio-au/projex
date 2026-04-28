import { AppError, toAppError } from '../../api/errors';
import type { UserId } from '../../types';
import { getAuthSessionFromRequest } from '../auth/betterAuth';
import {
  requireUserId,
  toServerSession,
  type ServerSession,
} from '../auth/session';

export type ServerFnContextInput = {
  /**
   * Preferred path for Start server functions:
   * pass the normalized server session from framework context.
   */
  session?: ServerSession | null;
  /**
   * Optional auth payload shape from adapters that already have Better Auth-like data.
   */
  auth?: {
    userId?: string | null;
    user?: { id?: string | null } | null;
  } | null;
  /**
   * Optional raw request if session must be resolved at the boundary.
   */
  request?: Request;
};

async function resolveSession(
  context: ServerFnContextInput
): Promise<ServerSession | null> {
  if (typeof context.session !== 'undefined') return context.session;
  if (typeof context.auth !== 'undefined') return toServerSession(context.auth);
  if (context.request) return getAuthSessionFromRequest(context.request);
  return null;
}

export async function requireServerUserId(
  context: ServerFnContextInput
): Promise<UserId> {
  const session = await resolveSession(context);
  return requireUserId(session);
}

/**
 * Normalizes unknown thrown values into AppError at the server function boundary.
 */
export async function withServerBoundary<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toAppError(err, 'INTERNAL_ERROR', 'Unexpected server error');
  }
}

export function assertContextProvided(
  context: ServerFnContextInput | undefined
): asserts context is ServerFnContextInput {
  if (!context) {
    throw new AppError('UNAUTHENTICATED', 'Missing server auth context');
  }
}
