import { createMiddleware } from '@tanstack/react-start';
import type { z } from 'zod';
import {
  AppError,
  getAppErrorCause,
  serverErrorLogFields,
} from '../api/errors';
import {
  parseAppEndpointInput,
  type AppEndpoint,
  type ServerFnContextInput,
  type ServerSession,
} from '../api/appEndpoints';

function appErrorStatus(code: AppError['code']): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'RATE_LIMITED') return 429;
  if (code === 'CONFLICT') return 409;
  if (code === 'VALIDATION_ERROR') return 422;
  if (code === 'NOT_IMPLEMENTED') return 501;
  return 500;
}

function isRequestServerResult(
  value: unknown
): value is { response: Response } {
  return (
    !!value &&
    typeof value === 'object' &&
    'response' in value &&
    (value as { response?: unknown }).response instanceof Response
  );
}

export type ApiRouteContext = {
  session: ServerSession | null;
  serverContext: ServerFnContextInput;
  requestId: string;
  origin: string | null;
  requestOrigin: string;
  started: number;
};

export type PublicApiRouteContext = {
  requestId: string;
  origin: string | null;
  requestOrigin: string;
  started: number;
};

type RequestContextModule = {
  resolveRequestServerContext(request: Request): Promise<{
    session: ServerSession | null;
    serverContext: ServerFnContextInput;
  }>;
};

type SecurityModule = {
  buildCorsHeaders(origin: string | null, requestOrigin: string): Headers;
  isOriginAllowed(origin: string | null, requestOrigin: string): boolean;
};

type RouteServerModuleLoader = () => Promise<unknown>;
const routeServerModuleLoaders = import.meta.glob(
  '../server/**/*.ts'
) as Record<string, RouteServerModuleLoader>;

function resolveRouteServerModuleLoader(specifier: string) {
  const normalizedSpecifier = specifier.endsWith('.ts')
    ? specifier
    : `${specifier}.ts`;
  return routeServerModuleLoaders[normalizedSpecifier];
}

export async function withPublicApi(
  request: Request,
  run: () => Promise<unknown>
): Promise<Response> {
  return withApiCore(request, run);
}

export function requireApiRouteContext(context: unknown): ApiRouteContext {
  if (
    !context ||
    typeof context !== 'object' ||
    !('serverContext' in context)
  ) {
    throw new AppError('INTERNAL_ERROR', 'Missing API route context');
  }
  return context as ApiRouteContext;
}

export function requirePublicApiRouteContext(
  context: unknown
): PublicApiRouteContext {
  if (!context || typeof context !== 'object' || !('requestId' in context)) {
    throw new AppError('INTERNAL_ERROR', 'Missing public API route context');
  }
  return context as PublicApiRouteContext;
}

export const apiRouteMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    return withApiCore(
      request,
      async ({ requestId, origin, requestOrigin, started }) => {
        const { resolveRequestServerContext } =
          await loadRouteServerModule<RequestContextModule>(
            '../server/http/requestContext'
          );
        const { session, serverContext } =
          await resolveRequestServerContext(request);
        return next({
          context: {
            session,
            serverContext,
            requestId,
            origin,
            requestOrigin,
            started,
          } satisfies ApiRouteContext,
        });
      }
    );
  }
);

export const publicApiRouteMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    return withApiCore(
      request,
      async ({ requestId, origin, requestOrigin, started }) => {
        return next({
          context: {
            requestId,
            origin,
            requestOrigin,
            started,
          } satisfies PublicApiRouteContext,
        });
      }
    );
  }
);

export function jsonApi(
  data: unknown,
  init?: ResponseInit & { headers?: HeadersInit }
): Response {
  return Response.json(data, init);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

export async function readValidatedJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T> {
  return parseAppEndpointInput(
    { inputSchema: schema },
    await readJsonBody(request)
  );
}

export async function executeApiEndpoint<TInput, TOutput>(args: {
  endpoint: AppEndpoint<TInput, TOutput>;
  context: unknown;
  input: unknown;
}): Promise<TOutput> {
  const { serverContext } = requireApiRouteContext(args.context);
  return args.endpoint.execute({
    context: serverContext,
    input: parseAppEndpointInput(args.endpoint, args.input),
  });
}

export async function executeLazyApiEndpoint<TOutput>(args: {
  specifier: string;
  exportName: string;
  context: unknown;
  input: unknown;
}): Promise<TOutput> {
  const endpoint = await loadRouteServerExport<AppEndpoint<unknown, TOutput>>(
    args.specifier,
    args.exportName
  );
  return executeApiEndpoint({
    endpoint,
    context: args.context,
    input: args.input,
  });
}

export async function loadRouteServerExport<TValue>(
  specifier: string,
  exportName: string
): Promise<TValue> {
  const mod = await loadRouteServerModule<Record<string, unknown>>(specifier);
  if (!(exportName in mod)) {
    throw new AppError(
      'INTERNAL_ERROR',
      `Missing server export "${exportName}" from "${specifier}"`
    );
  }
  return mod[exportName] as TValue;
}

export async function loadRouteServerModule<TModule>(
  specifier: string
): Promise<TModule> {
  const loader = resolveRouteServerModuleLoader(specifier);
  if (!loader) {
    throw new AppError(
      'INTERNAL_ERROR',
      `Missing route server module "${specifier}"`
    );
  }
  return (await loader()) as TModule;
}

async function withApiCore(
  request: Request,
  run: (meta: {
    requestId: string;
    origin: string | null;
    requestOrigin: string;
    started: number;
  }) => Promise<unknown>
): Promise<Response> {
  const { buildCorsHeaders, isOriginAllowed } =
    await loadRouteServerModule<SecurityModule>('../server/http/security');
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const started = Date.now();
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const requestOrigin = url.origin;

  if (request.method === 'OPTIONS') {
    const headers = buildCorsHeaders(origin, requestOrigin);
    headers.set('x-request-id', requestId);
    return new Response(null, { status: 204, headers });
  }

  if (!isOriginAllowed(origin, requestOrigin)) {
    const forbidden = Response.json(
      { code: 'FORBIDDEN', message: 'Origin not allowed' },
      { status: 403 }
    );
    const headers = new Headers(forbidden.headers);
    headers.set('x-request-id', requestId);
    console.warn(
      JSON.stringify({
        level: 'warn',
        type: 'api_request',
        requestId,
        method: request.method,
        path: url.pathname,
        status: 403,
        durationMs: Date.now() - started,
        code: 'FORBIDDEN',
        reason: 'origin_not_allowed',
      })
    );
    for (const [k, v] of buildCorsHeaders(origin, requestOrigin).entries())
      headers.set(k, v);
    return new Response(forbidden.body, {
      status: forbidden.status,
      statusText: forbidden.statusText,
      headers,
    });
  }

  const withRequestId = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set('x-request-id', requestId);
    for (const [k, v] of buildCorsHeaders(origin, requestOrigin).entries())
      headers.set(k, v);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };

  try {
    const data = await run({ requestId, origin, requestOrigin, started });
    const res =
      data instanceof Response
        ? data
        : isRequestServerResult(data)
          ? data.response
          : Response.json(data);
    const finalRes = withRequestId(res);
    console.info(
      JSON.stringify({
        level: 'info',
        type: 'api_request',
        requestId,
        method: request.method,
        path: url.pathname,
        status: finalRes.status,
        durationMs: Date.now() - started,
      })
    );
    return finalRes;
  } catch (err) {
    if (err instanceof AppError) {
      const res = Response.json(
        { code: err.code, message: err.message, meta: err.meta ?? null },
        { status: appErrorStatus(err.code) }
      );
      const finalRes = withRequestId(res);
      const retryAfterSeconds =
        err.code === 'RATE_LIMITED' &&
        typeof err.meta?.retryAfterSeconds === 'number'
          ? Math.max(1, Math.ceil(err.meta.retryAfterSeconds))
          : null;
      if (retryAfterSeconds) {
        finalRes.headers.set('retry-after', String(retryAfterSeconds));
      }
      const logEntry = {
        level: finalRes.status >= 500 ? 'error' : 'warn',
        type: 'api_request',
        requestId,
        method: request.method,
        path: url.pathname,
        status: finalRes.status,
        durationMs: Date.now() - started,
        code: err.code,
        message: err.message,
      };
      if (finalRes.status >= 500) {
        const cause = getAppErrorCause(err);
        console.error(
          JSON.stringify({
            ...logEntry,
            ...(cause ? serverErrorLogFields(cause.value) : {}),
          })
        );
      } else {
        console.warn(JSON.stringify(logEntry));
      }
      return finalRes;
    }
    const res = Response.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      },
      { status: 500 }
    );
    const finalRes = withRequestId(res);
    console.error(
      JSON.stringify({
        level: 'error',
        type: 'api_request',
        requestId,
        method: request.method,
        path: url.pathname,
        status: finalRes.status,
        durationMs: Date.now() - started,
        ...serverErrorLogFields(err),
      })
    );
    return finalRes;
  }
}
