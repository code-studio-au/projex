import { createMiddleware } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';

import type { ServerFnContextInput } from '../../api/appEndpoints';
import type { ServerSession } from '../auth/session';
import {
  normalizeAndLogServerFnError,
  serverFnRequestId,
} from './errorBoundary';

export type StartApiMiddlewareContext = {
  request: Request;
  requestId: string;
  session: ServerSession | null;
  serverContext: ServerFnContextInput;
};

type RequestContextModule = {
  resolveRequestServerContext(
    request: Request,
    requestId?: string
  ): Promise<{
    session: ServerSession | null;
    serverContext: ServerFnContextInput;
  }>;
};

type RequestContextModuleLoader = () => Promise<RequestContextModule>;

const requestContextModuleLoaders = import.meta.glob(
  '../http/requestContext.ts'
) as Record<string, RequestContextModuleLoader>;

function loadRequestContextModule() {
  const loader = requestContextModuleLoaders['../http/requestContext.ts'];
  if (!loader) {
    throw new Error('Missing server request context module loader');
  }
  return loader();
}

/**
 * Request-scoped TanStack Start middleware that exposes normalized raw server
 * context to native Start server functions.
 */
export const startApiMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next, serverFnMeta }) => {
    const request = getRequest();
    const requestId = serverFnRequestId(request);

    try {
      setResponseHeader('x-request-id', requestId);
      const { resolveRequestServerContext } = await loadRequestContextModule();
      const { session, serverContext } = await resolveRequestServerContext(
        request,
        requestId
      );

      return await next({
        context: {
          request,
          requestId,
          session,
          serverContext,
        } satisfies StartApiMiddlewareContext,
      });
    } catch (error) {
      throw normalizeAndLogServerFnError({
        error,
        request,
        requestId,
        serverFnMeta,
      });
    }
  }
);
