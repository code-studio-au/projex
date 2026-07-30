import { z } from 'zod';

export const apiMessageResponseSchema = z.object({
  message: z.string().optional(),
});

export const apiErrorResponseSchema = z.looseObject({
  code: z
    .enum([
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'RATE_LIMITED',
      'PAYLOAD_TOO_LARGE',
      'VALIDATION_ERROR',
      'CONFLICT',
      'NOT_IMPLEMENTED',
      'INTERNAL_ERROR',
    ])
    .optional(),
  message: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});
