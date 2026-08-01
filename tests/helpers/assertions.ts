export function requireDefined<T>(
  value: T | undefined,
  message = 'Expected value to be defined'
): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export function requireAt<T>(
  values: readonly T[],
  index: number,
  message = `Expected value at index ${index}`
): T {
  return requireDefined(values[index], message);
}
