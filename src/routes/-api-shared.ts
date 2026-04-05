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
  const { buildCorsHeaders, isOriginAllowed, withSecurityHeaders } = await import(
    '../server/http/security'
  );
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
    return withSecurityHeaders(request, new Response(null, { status: 204, headers }), {
      origin,
      requestOrigin,
    });
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
    return withSecurityHeaders(
      request,
      new Response(forbidden.body, {
        status: forbidden.status,
        statusText: forbidden.statusText,
        headers,
      }),
      { origin, requestOrigin }
    );
  }

  const withRequestId = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set('x-request-id', requestId);
    return withSecurityHeaders(
      request,
      new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      }),
      { origin, requestOrigin }
    );
  };

  try {
    const { createStartServerApi } = await import('../server/api/startBridge');
    const api = await createStartServerApi({ request });
    const data = await run(api);
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
