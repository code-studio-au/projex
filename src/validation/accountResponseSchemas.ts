import { z } from 'zod';
import { isoTimestampResponseSchema } from './responseSchemaPrimitives.ts';

export const pendingEmailChangeResponseSchema = z
  .object({
    newEmail: z.email(),
    requestedAt: isoTimestampResponseSchema,
    expiresAt: isoTimestampResponseSchema,
  })
  .nullable();

export const emailChangeRequestResponseSchema = z.object({
  newEmail: z.email(),
  expiresAt: isoTimestampResponseSchema,
  delivery: z.enum(['email', 'log']),
});

export const emailChangeConfirmResponseSchema = z.object({
  email: z.email(),
  previousEmail: z.email(),
});
