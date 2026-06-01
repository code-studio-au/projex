import type { ServerSession } from '../auth/session';
import { getAuthSessionFromRequest } from '../auth/betterAuth';
import { validateServerStartupEnv } from '../env';
import type { ServerFnContextInput } from '../fns/runtime';

export type ResolvedRequestServerContext = {
  session: ServerSession | null;
  serverContext: ServerFnContextInput;
};

export async function resolveRequestServerContext(
  request: Request
): Promise<ResolvedRequestServerContext> {
  validateServerStartupEnv();
  const session = await getAuthSessionFromRequest(request);
  return {
    session,
    serverContext: { request, session },
  };
}
