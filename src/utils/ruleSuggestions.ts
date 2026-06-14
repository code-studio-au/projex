import type { Txn } from '../types';

export type RuleSuggestionPatternBasis =
  | 'item'
  | 'description'
  | 'item_description';

function normalizePatternText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function hasUsefulPattern(value: string): boolean {
  if (value.length < 3) return false;
  return /[a-z]/.test(value);
}

export function deriveRuleSuggestionPattern(
  txn: Pick<Txn, 'item' | 'description'>
): {
  basis: RuleSuggestionPatternBasis;
  raw: string;
  normalized: string;
  proposedMatchText: string;
} | null {
  const itemRaw = txn.item.trim();
  const descriptionRaw = txn.description.trim();
  const itemNormalized = normalizePatternText(itemRaw);
  const descriptionNormalized = normalizePatternText(descriptionRaw);

  if (hasUsefulPattern(itemNormalized)) {
    return {
      basis: 'item',
      raw: itemRaw,
      normalized: itemNormalized,
      proposedMatchText: itemRaw,
    };
  }

  if (hasUsefulPattern(descriptionNormalized)) {
    return {
      basis: 'description',
      raw: descriptionRaw,
      normalized: descriptionNormalized,
      proposedMatchText: descriptionRaw,
    };
  }

  const combinedRaw = [itemRaw, descriptionRaw]
    .filter(Boolean)
    .join(' ')
    .trim();
  const combinedNormalized = normalizePatternText(combinedRaw);
  if (!hasUsefulPattern(combinedNormalized)) return null;

  return {
    basis: 'item_description',
    raw: combinedRaw,
    normalized: combinedNormalized,
    proposedMatchText: combinedRaw,
  };
}

export function didManualCodingTargetChange(
  prev: Pick<Txn, 'categoryId' | 'subCategoryId'>,
  next: Pick<Txn, 'categoryId' | 'subCategoryId'>
): boolean {
  return (
    prev.categoryId !== next.categoryId ||
    prev.subCategoryId !== next.subCategoryId
  );
}
