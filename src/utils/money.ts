/**
 * Money helpers.
 *
 * We store money in minor units (cents) everywhere in the app state and API
 * boundary. This avoids floating point rounding issues and maps cleanly to
 * Postgres BIGINT columns.
 */

/** Convert a decimal currency amount (e.g. 12.34) to minor units (1234). */
export function toCents(amount: number): number {
  // Guard against NaN/undefined
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert minor units (cents) to a decimal amount (e.g. 1234 -> 12.34). */
export function fromCents(cents: number): number {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

/** Format cents as a localized currency string. */
export function formatCurrencyFromCents(
  cents: number,
  ccy: string = 'AUD'
): string {
  const normalizedCurrency = ccy.toUpperCase();

  return fromCents(cents).toLocaleString(
    normalizedCurrency === 'AUD' ? 'en-AU' : undefined,
    {
      style: 'currency',
      currency: normalizedCurrency,
      currencyDisplay: 'narrowSymbol',
    }
  );
}
