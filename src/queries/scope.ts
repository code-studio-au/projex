import { useSessionQuery } from './session';

/**
 * Query keys are session-scoped for permissioned data.
 * When no session is present, we use a stable sentinel.
 */
export function useQueryScopeUserId(): string {
  const session = useSessionQuery();
  return session.data?.userId ?? 'anonymous';
}
