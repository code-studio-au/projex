import { getAppErrorCause, toAppError, type AppError } from '../../api/errors';
import { logServerEvent } from '../../api/serverLogging.ts';

type ServerFnMeta = {
  id: string;
  name: string;
  filename: string;
};

export function serverFnRequestId(request: Request): string {
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}

export function normalizeAndLogServerFnError(args: {
  error: unknown;
  request: Request;
  requestId: string;
  serverFnMeta: ServerFnMeta;
}): AppError {
  const appError = toAppError(
    args.error,
    'INTERNAL_ERROR',
    'Unexpected server error'
  );
  const cause = getAppErrorCause(appError);
  if (cause) {
    const url = new URL(args.request.url);
    logServerEvent({
      level: 'error',
      event: 'server_fn',
      error: cause.value,
      fields: {
        requestId: args.requestId,
        method: args.request.method,
        path: url.pathname,
        status: 500,
        code: appError.code,
        serverFnId: args.serverFnMeta.id,
        serverFnName: args.serverFnMeta.name,
        serverFnFile: args.serverFnMeta.filename,
      },
    });
  }
  return appError;
}
