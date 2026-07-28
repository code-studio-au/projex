import { z } from 'zod';

export const betterAuthSignUpResponseSchema = z.object({
  user: z.object({
    id: z.string().trim().min(1),
    email: z.email().optional(),
    name: z.string().optional(),
  }),
});
