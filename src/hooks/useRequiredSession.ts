import type { Session } from '../api/contract';
import { useSessionQuery } from '../queries/session';

/**
 * Use when a component is only reachable from an authenticated route.
 * If session is missing, we throw to the route error boundary (router beforeLoad
 * should already have redirected, so this is a defensive invariant).
 */
export function useRequiredSession(): Session {
  const q = useSessionQuery();
  if (!q.data) throw new Error('Not authenticated');
  return q.data;
}
