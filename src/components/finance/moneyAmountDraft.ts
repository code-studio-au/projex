import { fromCents } from '../../utils/money';

export type MoneyDraft = number | string;

export type ParsedMoneyDraft =
  { valid: true; amountCents: number } | { valid: false; message: string };

export function parseMoneyAmountDraft(
  draft: MoneyDraft,
  minimumCents?: number
): ParsedMoneyDraft {
  const normalized =
    typeof draft === 'number' ? draft : draft.replaceAll(',', '').trim();
  if (
    normalized === '' ||
    (typeof normalized === 'string' &&
      !/^-?\d+(?:\.\d{1,2})?$/.test(normalized))
  ) {
    return {
      valid: false,
      message: 'Enter a complete amount with up to 2 decimal places.',
    };
  }

  const amount = Number(normalized);
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents)) {
    return { valid: false, message: 'Enter a valid amount.' };
  }
  if (minimumCents !== undefined && amountCents < minimumCents) {
    return {
      valid: false,
      message: `Amount cannot be less than ${fromCents(minimumCents).toFixed(2)}.`,
    };
  }
  return { valid: true, amountCents };
}
