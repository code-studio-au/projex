import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import type { ServerFnContextInput } from '../../api/appEndpoints';
import type { ServerSession } from '../auth/session';

export type StartApiMiddlewareContext = {
  request: Request;
  session: ServerSession | null;
  serverContext: ServerFnContextInput;
};

type RequestContextModule = {
  resolveRequestServerContext(request: Request): Promise<{
    session: ServerSession | null;
    serverContext: ServerFnContextInput;
  }>;
};

const requestContextModuleSpecifier = ['..', 'http', 'requestContext'].join(
  '/'
);

/**
 * Request-scoped TanStack Start middleware that exposes normalized raw server
 * context to native Start server functions.
 */
export const startApiMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();
    const { resolveRequestServerContext } = (await import(
      requestContextModuleSpecifier
    )) as RequestContextModule;
    const { session, serverContext } =
      await resolveRequestServerContext(request);

    return next({
      context: {
        request,
        session,
        serverContext,
      } satisfies StartApiMiddlewareContext,
    });
  }
);
