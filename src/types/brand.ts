export type Brand<T, B extends string> = T & { readonly __brand: B };

/**
 * Cast helpers for branded types.
 * These are intentionally "unsafe" at runtime (no checks) but make intent explicit.
 */
export function brand<T, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}
