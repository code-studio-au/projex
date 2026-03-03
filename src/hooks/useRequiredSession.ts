import type { Session } from '../api/contract';
import { AppError } from '../api/errors';
import { useSessionQuery } from '../queries/session';

/**
 * Use when a component is only reachable from an authenticated route.
 * If session is missing, we throw to the route error boundary (router beforeLoad
 * should already have redirected, so this is a defensive invariant).
 */
export function useRequiredSession(): Session {
  const q = useSessionQuery();
  if (!q.data) throw new AppError('UNAUTHENTICATED', 'Not authenticated');
  return q.data;
}
