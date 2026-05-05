import type { z } from 'zod';

export type JsonParseResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: SyntaxError };

export function safeParseJson(text: string): JsonParseResult {
  try {
    const data: unknown = JSON.parse(text);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof SyntaxError ? error : new SyntaxError(),
    };
  }
}

export function parseJsonOrNull(text: string): unknown {
  if (!text) return null;

  const parsed = safeParseJson(text);
  return parsed.success ? parsed.data : null;
}

export function parseJsonOrText(text: string): unknown {
  if (!text) return null;

  const parsed = safeParseJson(text);
  return parsed.success ? parsed.data : text;
}

export function parseJsonWithSchema<T>(
  text: string,
  schema: z.ZodType<T>
): JsonParseResult<T> {
  const parsed = safeParseJson(text);
  if (!parsed.success) return parsed;

  const schemaResult = schema.safeParse(parsed.data);
  if (!schemaResult.success) {
    return {
      success: false,
      error: new SyntaxError('JSON did not match expected schema'),
    };
  }

  return { success: true, data: schemaResult.data };
}
