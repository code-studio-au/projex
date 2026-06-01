import type { ServerSession } from '../auth/session';
import { getAuthSessionFromRequest } from '../auth/betterAuth';
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
    const session = await getAuthSessionFromRequest(request);
    return {
      session,
      serverContext: { request, session },
    };
  })();

  requestContextCache.set(request, pending);
  return pending;
}
