import type { z } from 'zod';
import { AppError } from '../api/errors';

export function validateOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const first = parsed.error.issues[0];
  const message = first?.message ?? 'Validation failed';
  throw new AppError('VALIDATION_ERROR', message, { issues: parsed.error.issues });
}
