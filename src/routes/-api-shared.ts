import type { ProjexApi } from '../api/types';
import { AppError } from '../api/errors';

function appErrorStatus(code: AppError['code']): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'CONFLICT') return 409;
  if (code === 'VALIDATION_ERROR') return 422;
  if (code === 'NOT_IMPLEMENTED') return 501;
  return 500;
}

export async function withApi(
  request: Request,
  run: (api: ProjexApi) => Promise<unknown>
): Promise<Response> {
  return withApiCore(request, async () => {
    const { createStartServerApi } = await import('../server/api/startBridge');
    const api = await createStartServerApi({ request });
    return run(api);
  });
}

export async function withPublicApi(
  request: Request,
  run: () => Promise<unknown>
): Promise<Response> {
  return withApiCore(request, run);
}

async function withApiCore(
  request: Request,
  run: () => Promise<unknown>
): Promise<Response> {
  const { buildCorsHeaders, isOriginAllowed } = await import('../server/http/security');
  const requestId =
    request.headers.get('x-request-id') ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
    for (const [k, v] of buildCorsHeaders(origin, requestOrigin).entries()) headers.set(k, v);
    return new Response(forbidden.body, {
      status: forbidden.status,
      statusText: forbidden.statusText,
      headers,
    });
  }

  const withRequestId = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set('x-request-id', requestId);
    for (const [k, v] of buildCorsHeaders(origin, requestOrigin).entries()) headers.set(k, v);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };

  try {
    const data = await run();
    const res = data instanceof Response ? data : Response.json(data);
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
      console.warn(
        JSON.stringify({
          level: 'warn',
          type: 'api_request',
          requestId,
          method: request.method,
          path: url.pathname,
          status: finalRes.status,
          durationMs: Date.now() - started,
          code: err.code,
          message: err.message,
        })
      );
      return finalRes;
    }
    const res = Response.json(
      {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected server error',
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
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return finalRes;
  }
}
