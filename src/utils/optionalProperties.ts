type UndefinedPropertiesOmitted<T extends object> = T extends unknown
  ? {
      [K in keyof T as undefined extends T[K] ? never : K]: T[K];
    } & {
      [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
        T[K],
        undefined
      >;
    }
  : never;

/**
 * Converts explicit `undefined` values at an object boundary into omitted keys.
 * This is intentionally shallow so nested DTOs remain explicit at each boundary.
 */
export function omitUndefinedProperties<T extends object>(
  value: T
): UndefinedPropertiesOmitted<T> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  ) as UndefinedPropertiesOmitted<T>;
}
