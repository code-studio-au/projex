import { z } from 'zod';

export const apiMessageResponseSchema = z.object({
  message: z.string().optional(),
});

export const emailChangeConfirmResponseSchema = z.object({
  email: z.string(),
  previousEmail: z.string(),
});

export const betterAuthLikePayloadSchema = z
  .object({
    userId: z.string().nullable().optional(),
    user: z
      .object({
        id: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .nullable();
