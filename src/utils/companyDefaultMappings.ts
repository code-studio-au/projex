import type {
  Category,
  CategoryId,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
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
    (category) => category.id === defaultSubCategory.companyDefaultCategoryId
  );
  if (!defaultCategory) return null;

  // Origin IDs remain unambiguous when the same subcategory name appears under
  // multiple categories. A project override may also move the inherited item,
  // so resolve its current project parent rather than requiring the company path.
  const inheritedProjectSubCategory = args.projectSubCategories.find(
    (subCategory) => subCategory.originCompanyItemId === defaultSubCategory.id
  );
  if (inheritedProjectSubCategory) {
    const currentProjectCategory = args.projectCategories.find(
      (category) => category.id === inheritedProjectSubCategory.categoryId
    );
    if (!currentProjectCategory) return null;
    return {
      categoryId: currentProjectCategory.id,
      subCategoryId: inheritedProjectSubCategory.id,
    };
  }

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

  const projectSubCategory = args.projectSubCategories.find(
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
