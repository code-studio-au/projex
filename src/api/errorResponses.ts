import { apiErrorResponseSchema } from '../validation/responseSchemas';

export function apiErrorMessage(body: unknown, fallback: string): string {
  const parsed = apiErrorResponseSchema.safeParse(body);
  if (!parsed.success) return fallback;

  return parsed.data.message ?? fallback;
}
