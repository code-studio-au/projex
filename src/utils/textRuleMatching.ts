export function normalizeRuleText(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalizeRuleText(value: string | undefined | null): string {
  return normalizeRuleText(value)
    .split(' ')
    .map((word) => {
      if (word.endsWith('ies') && word.length > 4) {
        return `${word.slice(0, -3)}y`;
      }
      if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
        return word.slice(0, -1);
      }
      return word;
    })
    .join(' ');
}

export function transactionRuleHaystack(input: {
  item: string | undefined | null;
  description: string | undefined | null;
}) {
  return `${normalizeRuleText(input.item)} ${normalizeRuleText(input.description)}`.trim();
}

export function textRuleMatches(args: {
  haystack: string;
  needle: string | undefined | null;
}) {
  const needle = normalizeRuleText(args.needle);
  if (!needle) return false;
  const canonicalHaystack = canonicalizeRuleText(args.haystack);
  const canonicalNeedle = canonicalizeRuleText(args.needle);
  return (
    args.haystack.includes(needle) ||
    canonicalHaystack.includes(canonicalNeedle)
  );
}
