import type { ServerSession } from '../auth/session';
import { resolveVerifiedCurrentSession } from '../auth/currentSession';
import type { ServerFnContextInput } from '../fns/runtime';

export type ResolvedRequestServerContext = {
  session: ServerSession | null;
  serverContext: ServerFnContextInput;
};

const requestContextCache = new WeakMap<
  Request,
  Promise<ResolvedRequestServerContext>
>();

export async function resolveRequestServerContext(
  request: Request,
  requestId?: string
): Promise<ResolvedRequestServerContext> {
  const cached = requestContextCache.get(request);
  if (cached) return cached;

  const pending = (async () => {
    const { session, sessionVerified } = await resolveVerifiedCurrentSession(
      request,
      requestId
    );
    return {
      session,
      serverContext: {
        request,
        requestId,
        session,
        sessionVerified,
      },
    };
  })();

  requestContextCache.set(request, pending);
  return pending;
}
