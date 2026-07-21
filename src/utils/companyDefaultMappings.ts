import type {
  Category,
  CategoryId,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyDefaultSubCategoryId,
  SubCategory,
  SubCategoryId,
} from '../types';
import { canonicalizeRuleText, normalizeRuleText } from './textRuleMatching';

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

export function defaultCategoryIdForRule(
  subCategoryId: CompanyDefaultSubCategoryId,
  defaultSubCategories: CompanyDefaultSubCategory[]
) {
  return (
    defaultSubCategories.find((subCategory) => subCategory.id === subCategoryId)
      ?.companyDefaultCategoryId ?? null
  );
}
