import type { Txn } from '../types';

export const MIN_RULE_SUGGESTION_SAMPLE_COUNT = 3;

export type RuleSuggestionPatternBasis =
  | 'item'
  | 'description'
  | 'item_description';

const REFERENCE_LABEL_PATTERN =
  /\b(invoice|inv|reference|ref|receipt|order|po)\s*[#:-]?\s*[a-z0-9-]{4,}\b/gi;
const LONG_REFERENCE_TOKEN_PATTERN = /\b[a-z]*\d[a-z0-9-]{4,}\b/gi;

export function normalizeRuleSuggestionPatternText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(REFERENCE_LABEL_PATTERN, '$1 ')
    .replace(LONG_REFERENCE_TOKEN_PATTERN, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const itemNormalized = normalizeRuleSuggestionPatternText(itemRaw);
  const descriptionNormalized =
    normalizeRuleSuggestionPatternText(descriptionRaw);

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
  const combinedNormalized = normalizeRuleSuggestionPatternText(combinedRaw);
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

export function buildRuleSuggestionMatchTextOptions(args: {
  normalizedPattern: string;
  rawPatterns: string[];
}): { proposedMatchText: string; alternatives: string[] } {
  const uniqueRawPatterns = Array.from(
    new Map(
      args.rawPatterns.flatMap((value) => {
        const trimmed = value.trim();
        return trimmed ? [[trimmed.toLowerCase(), trimmed]] : [];
      })
    ).values()
  ).sort((a, b) => a.length - b.length || a.localeCompare(b));

  const rawPatternIsAlreadyStable =
    uniqueRawPatterns.length === 1 &&
    normalizeRuleSuggestionPatternText(uniqueRawPatterns[0]!) ===
      uniqueRawPatterns[0]!.trim().toLowerCase();
  const proposedMatchText = rawPatternIsAlreadyStable
    ? uniqueRawPatterns[0]!
    : args.normalizedPattern;
  const alternatives = Array.from(
    new Map(
      [proposedMatchText, args.normalizedPattern, ...uniqueRawPatterns].flatMap(
        (value) => {
          const trimmed = value.trim();
          return trimmed ? [[trimmed.toLowerCase(), trimmed]] : [];
        }
      )
    ).values()
  ).slice(0, 3);

  return { proposedMatchText, alternatives };
}

export function calculateRuleSuggestionConfidence(args: {
  sampleCount: number;
  distinctTxnDateCount: number;
  distinctProjectCount: number;
  patternBasis: RuleSuggestionPatternBasis;
}): number {
  const sampleScore = Math.min(Math.max(args.sampleCount, 0), 6) * 5;
  const dateScore =
    args.distinctTxnDateCount >= 3
      ? 15
      : args.distinctTxnDateCount >= 2
        ? 10
        : 0;
  const projectScore = args.distinctProjectCount >= 2 ? 5 : 0;
  const patternScore =
    args.patternBasis === 'item'
      ? 10
      : args.patternBasis === 'description'
        ? 5
        : 0;

  return Math.min(
    100,
    40 + sampleScore + dateScore + projectScore + patternScore
  );
}

export function ruleSuggestionConfidenceLevel(
  score: number
): 'low' | 'medium' | 'high' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export function ruleSuggestionConfidenceReasons(args: {
  sampleCount: number;
  distinctTxnDateCount: number;
  distinctProjectCount: number;
  patternBasis: RuleSuggestionPatternBasis;
}): string[] {
  const reasons = [
    `${args.sampleCount} matching transactions`,
    args.distinctTxnDateCount === 1
      ? '1 transaction date'
      : `${args.distinctTxnDateCount} transaction dates`,
  ];
  if (args.distinctProjectCount > 1) {
    reasons.push(`${args.distinctProjectCount} projects`);
  }
  reasons.push(
    args.patternBasis === 'item'
      ? 'Stable transaction item'
      : args.patternBasis === 'description'
        ? 'Stable description'
        : 'Combined item and description'
  );
  return reasons;
}
