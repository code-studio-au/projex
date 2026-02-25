export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
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

  constructor(code: AppErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

export function isAppError(err: unknown): err is AppError {
  if (typeof err !== 'object' || err === null) return false;
  const maybe = err as { name?: unknown };
  return maybe.name === 'AppError';
}

/**
 * Normalizes unknown thrown values into AppError for consistent API boundaries.
 */
export function toAppError(
  err: unknown,
  fallbackCode: AppErrorCode = 'INTERNAL_ERROR',
  fallbackMessage = 'Unexpected error'
): AppError {
  if (isAppError(err)) return err;
  if (err instanceof Error) return new AppError(fallbackCode, err.message);
  if (typeof err === 'string') return new AppError(fallbackCode, err);
  return new AppError(fallbackCode, fallbackMessage);
}
