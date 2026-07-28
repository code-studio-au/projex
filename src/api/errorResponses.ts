import { AppError, type AppErrorCode } from './errors';
import { apiErrorResponseSchema } from '../validation/apiResponseSchemas';

export function apiErrorMessage(body: unknown, fallback: string): string {
  const parsed = apiErrorResponseSchema.safeParse(body);
  if (!parsed.success) return fallback;

  return parsed.data.message ?? fallback;
}

export function apiErrorFromBody(
  body: unknown,
  fallbackMessage: string,
  fallbackCode: AppErrorCode = 'INTERNAL_ERROR'
): AppError {
  const parsed = apiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return new AppError(fallbackCode, fallbackMessage);
  }

  return new AppError(
    parsed.data.code ?? fallbackCode,
    parsed.data.message ?? fallbackMessage,
    parsed.data.meta ?? undefined
  );
}
