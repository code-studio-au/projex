import type { ProjectAutoCodingRule, Txn } from '../types';
import { asCompanyDefaultMappingRuleId } from '../types';
import { textRuleMatches, transactionRuleHaystack } from './textRuleMatching';

export function findMatchingProjectAutoCodingRule(
  txn: Pick<Txn, 'item' | 'description'>,
  rules: ProjectAutoCodingRule[]
): ProjectAutoCodingRule | null {
  const haystack = transactionRuleHaystack(txn);
  if (!haystack) return null;
  const sorted = [...rules].sort((a, b) => {
    const aGroup = a.syncStatus === 'inherited' ? 1 : 0;
    const bGroup = b.syncStatus === 'inherited' ? 1 : 0;
    if (aGroup !== bGroup) return aGroup - bGroup;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });
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
  const inheritedCompanyRuleId =
    rule.originScope === 'company' &&
    rule.syncStatus === 'inherited' &&
    rule.originCompanyItemId
      ? asCompanyDefaultMappingRuleId(rule.originCompanyItemId)
      : undefined;
  return {
    ...args.txn,
    categoryId: rule.categoryId,
    subCategoryId: rule.subCategoryId,
    companyDefaultMappingRuleId: inheritedCompanyRuleId,
    codingSource: inheritedCompanyRuleId
      ? 'company_default_rule'
      : 'project_rule',
    codingPendingApproval: true,
  };
}
