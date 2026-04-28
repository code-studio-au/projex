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

function normalize(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canonicalize(value: string | undefined | null): string {
  return normalize(value)
    .split(' ')
    .map((word) => {
      if (word.endsWith('ies') && word.length > 4)
        return `${word.slice(0, -3)}y`;
      if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3)
        return word.slice(0, -1);
      return word;
    })
    .join(' ');
}

function transactionMatchText(txn: Pick<Txn, 'item' | 'description'>): string {
  return `${normalize(txn.item)} ${normalize(txn.description)}`.trim();
}

export function findMatchingCompanyDefaultRule(
  txn: Pick<Txn, 'item' | 'description'>,
  rules: CompanyDefaultMappingRule[]
): CompanyDefaultMappingRule | null {
  const haystack = transactionMatchText(txn);
  const canonicalHaystack = canonicalize(haystack);
  if (!haystack) return null;
  const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const rule of sorted) {
    const needle = normalize(rule.matchText);
    const canonicalNeedle = canonicalize(rule.matchText);
    if (!needle) continue;
    if (
      haystack.includes(needle) ||
      canonicalHaystack.includes(canonicalNeedle)
    )
      return rule;
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

  const projectCategory = args.projectCategories.find(
    (category) =>
      normalize(category.name) === normalize(defaultCategory.name) ||
      canonicalize(category.name) === canonicalize(defaultCategory.name)
  );
  if (!projectCategory) return null;

  const projectSubCategory = args.projectSubCategories.find(
    (subCategory) =>
      subCategory.categoryId === projectCategory.id &&
      (normalize(subCategory.name) === normalize(defaultSubCategory.name) ||
        canonicalize(subCategory.name) ===
          canonicalize(defaultSubCategory.name))
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
