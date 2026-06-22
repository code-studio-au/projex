import type { z } from 'zod';

import { validateOrThrow } from '../../../validation/validate';

export function serverFnInputValidator<T>(schema: z.ZodType<T>) {
  return (input: unknown) => validateOrThrow(schema, input);
}
