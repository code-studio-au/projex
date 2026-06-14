import type { ProjectAutoCodingRule, Txn } from '../types';
import { textRuleMatches, transactionRuleHaystack } from './textRuleMatching';

export function findMatchingProjectAutoCodingRule(
  txn: Pick<Txn, 'item' | 'description'>,
  rules: ProjectAutoCodingRule[]
): ProjectAutoCodingRule | null {
  const haystack = transactionRuleHaystack(txn);
  if (!haystack) return null;
  const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const rule of sorted) {
    if (textRuleMatches({ haystack, needle: rule.matchText })) {
      return rule;
    }
  }
  return null;
}

export function applyProjectAutoCodingRule(args: {
  txn: Txn;
  rules: ProjectAutoCodingRule[];
}): Txn {
  if (args.txn.subCategoryId) return args.txn;
  const rule = findMatchingProjectAutoCodingRule(args.txn, args.rules);
  if (!rule) return args.txn;
  return {
    ...args.txn,
    categoryId: rule.categoryId,
    subCategoryId: rule.subCategoryId,
    codingSource: 'project_rule',
    codingPendingApproval: true,
  };
}
