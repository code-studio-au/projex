import type {
  Category,
  CategoryId,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyDefaultSubCategoryId,
  SubCategory,
  SubCategoryId,
  Txn,
} from '../types';
import {
  canonicalizeRuleText,
  normalizeRuleText,
  textRuleMatches,
  transactionRuleHaystack,
} from './textRuleMatching';

export function findMatchingCompanyDefaultRule(
  txn: Pick<Txn, 'item' | 'description'>,
  rules: CompanyDefaultMappingRule[]
): CompanyDefaultMappingRule | null {
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

export function resolveCompanyDefaultRuleToProjectTaxonomy(args: {
  rule: CompanyDefaultMappingRule;
  defaultCategories: CompanyDefaultCategory[];
  defaultSubCategories: CompanyDefaultSubCategory[];
  projectCategories: Category[];
  projectSubCategories: SubCategory[];
}): { categoryId: CategoryId; subCategoryId: SubCategoryId } | null {
  const defaultSubCategory = args.defaultSubCategories.find(
    (subCategory) => subCategory.id === args.rule.companyDefaultSubCategoryId
  );
  if (!defaultSubCategory) return null;

  const defaultCategory = args.defaultCategories.find(
    (category) => category.id === args.rule.companyDefaultCategoryId
  );
  if (!defaultCategory) return null;

  const projectCategory =
    args.projectCategories.find(
      (category) => category.originCompanyItemId === defaultCategory.id
    ) ??
    args.projectCategories.find(
      (category) =>
        normalizeRuleText(category.name) ===
          normalizeRuleText(defaultCategory.name) ||
        canonicalizeRuleText(category.name) ===
          canonicalizeRuleText(defaultCategory.name)
    );
  if (!projectCategory) return null;

  const projectSubCategory =
    args.projectSubCategories.find(
      (subCategory) =>
        subCategory.categoryId === projectCategory.id &&
        subCategory.originCompanyItemId === defaultSubCategory.id
    ) ??
    args.projectSubCategories.find(
      (subCategory) =>
        subCategory.categoryId === projectCategory.id &&
        (normalizeRuleText(subCategory.name) ===
          normalizeRuleText(defaultSubCategory.name) ||
          canonicalizeRuleText(subCategory.name) ===
            canonicalizeRuleText(defaultSubCategory.name))
    );
  if (!projectSubCategory) return null;

  return {
    categoryId: projectCategory.id,
    subCategoryId: projectSubCategory.id,
  };
}

export function mapImportedTransactionWithCompanyDefaults(args: {
  txn: Txn;
  rules: CompanyDefaultMappingRule[];
  defaultCategories: CompanyDefaultCategory[];
  defaultSubCategories: CompanyDefaultSubCategory[];
  projectCategories: Category[];
  projectSubCategories: SubCategory[];
}): Txn {
  if (args.txn.subCategoryId) return args.txn;

  const rule = findMatchingCompanyDefaultRule(args.txn, args.rules);
  if (!rule) return args.txn;

  const resolved = resolveCompanyDefaultRuleToProjectTaxonomy({
    rule,
    defaultCategories: args.defaultCategories,
    defaultSubCategories: args.defaultSubCategories,
    projectCategories: args.projectCategories,
    projectSubCategories: args.projectSubCategories,
  });
  if (!resolved) return args.txn;

  return {
    ...args.txn,
    categoryId: resolved.categoryId,
    subCategoryId: resolved.subCategoryId,
    companyDefaultMappingRuleId: rule.id,
    codingSource: 'company_default_rule',
    codingPendingApproval: true,
  };
}

export function defaultCategoryIdForRule(
  subCategoryId: CompanyDefaultSubCategoryId,
  defaultSubCategories: CompanyDefaultSubCategory[]
) {
  return (
    defaultSubCategories.find((subCategory) => subCategory.id === subCategoryId)
      ?.companyDefaultCategoryId ?? null
  );
}
