import { AppError, toAppError } from '../../api/errors';
import type { ServerFnContextInput } from '../../api/appEndpoints';
import type { UserId } from '../../types';
import {
  resolveVerifiedCurrentSession,
  verifySessionUser,
} from '../auth/currentSession';
import {
  requireUserId,
  toServerSession,
  type ServerSession,
} from '../auth/session';

export type { ServerFnContextInput } from '../../api/appEndpoints';

async function resolveSession(context: ServerFnContextInput): Promise<{
  session: ServerSession | null;
  sessionVerified: boolean;
}> {
  if (typeof context.session !== 'undefined') {
    return {
      session: context.session,
      sessionVerified: context.sessionVerified === true,
    };
  }
  if (typeof context.auth !== 'undefined') {
    return {
      session: toServerSession(context.auth),
      sessionVerified: false,
    };
  }
  if (context.request) {
    return resolveVerifiedCurrentSession(context.request);
  }
  return {
    session: null,
    sessionVerified: false,
  };
}

export async function requireServerUserId(
  context: ServerFnContextInput
): Promise<UserId> {
  const { session, sessionVerified } = await resolveSession(context);
  const userId = requireUserId(session);
  if (sessionVerified) {
    return userId;
  }
  const verification = await verifySessionUser(userId);
  if (verification === 'missing') {
    throw new AppError('UNAUTHENTICATED', 'Not authenticated');
  }
  if (verification === 'disabled') {
    throw new AppError('FORBIDDEN', 'User is disabled');
  }
  return userId;
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
