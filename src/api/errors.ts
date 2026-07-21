export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

/**
 * Typed error for a predictable client/server contract.
 *
 * In TanStack Start, server functions should throw AppError and the client
 * should map these codes to UI toasts and form errors.
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly meta?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

const normalizedErrorCauses = new WeakMap<
  AppError,
  Readonly<{ value: unknown }>
>();

function isAppError(err: unknown): err is AppError {
  if (typeof err !== 'object' || err === null) return false;
  const maybe = err as { name?: unknown };
  return maybe.name === 'AppError';
}

/**
 * Normalizes unknown thrown values into AppError for consistent API boundaries.
 * Only messages from deliberately constructed AppError instances are public.
 */
export function toAppError(
  err: unknown,
  fallbackCode: AppErrorCode = 'INTERNAL_ERROR',
  fallbackMessage = 'Unexpected error'
): AppError {
  if (isAppError(err)) return err;

  const appError = new AppError(fallbackCode, fallbackMessage);
  normalizedErrorCauses.set(appError, { value: err });
  return appError;
}

export function getAppErrorCause(
  error: AppError
): Readonly<{ value: unknown }> | undefined {
  return normalizedErrorCauses.get(error);
}

/** Formats private exception details for structured server logs, never responses. */
export function serverErrorLogFields(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.message,
      errorName: error.name,
      ...(error.stack ? { errorStack: error.stack } : {}),
    };
  }
  return { error: String(error) };
}
