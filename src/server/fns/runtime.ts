import { AppError, toAppError } from '../../api/errors';
import type { ServerFnContextInput } from '../../api/appEndpoints';
import type { UserId } from '../../types';
import { getAuthSessionFromRequest } from '../auth/betterAuth';
import { getDb } from '../db/db';
import {
  requireUserId,
  toServerSession,
  type ServerSession,
} from '../auth/session';

export type { ServerFnContextInput } from '../../api/appEndpoints';

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
  const userId = requireUserId(session);
  if (context.sessionVerified === true) {
    return userId;
  }
  const user = await getDb()
    .selectFrom('users')
    .select(['id', 'disabled'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Not authenticated');
  }
  if (user.disabled) {
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
