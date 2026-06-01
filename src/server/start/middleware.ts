import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { getAuthSessionFromRequest } from '../auth/betterAuth';
import type { ServerSession } from '../auth/session';
import type { ServerFnContextInput } from '../fns/runtime';
import { validateServerStartupEnv } from '../env';

export type StartApiMiddlewareContext = {
  request: Request;
  session: ServerSession | null;
  serverContext: ServerFnContextInput;
};

/**
 * Request-scoped TanStack Start middleware that exposes normalized raw server
 * context to native Start server functions.
 */
export const startApiMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();
    validateServerStartupEnv();
    const session = await getAuthSessionFromRequest(request);
    const serverContext: ServerFnContextInput = { request, session };

    return next({
      context: {
        request,
        session,
        serverContext,
      } satisfies StartApiMiddlewareContext,
    });
  }
);
