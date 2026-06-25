import type { ServerSession } from '../auth/session';
import { resolveCurrentSession } from '../auth/currentSession';
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
  request: Request
): Promise<ResolvedRequestServerContext> {
  const cached = requestContextCache.get(request);
  if (cached) return cached;

  const pending = (async () => {
    const session = await resolveCurrentSession(request);
    return {
      session,
      serverContext: {
        request,
        session,
        sessionVerified: session !== null,
      },
    };
  })();

  requestContextCache.set(request, pending);
  return pending;
}
