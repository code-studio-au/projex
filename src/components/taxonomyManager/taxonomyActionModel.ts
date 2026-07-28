import type { TaxonomyDeleteTarget } from './taxonomyActionTypes';

type TaxonomySubCategoryItem = {
  id: string;
  categoryId: string;
  name: string;
};

export function getTaxonomyDeleteAffectedSubCategoryIds(args: {
  target: TaxonomyDeleteTarget | null;
  subCategories: TaxonomySubCategoryItem[];
}) {
  const { target, subCategories } = args;
  return new Set(
    target?.kind === 'category'
      ? subCategories
          .filter((subCategory) => subCategory.categoryId === target.id)
          .map((subCategory) => subCategory.id)
      : target?.kind === 'subcategory'
        ? [target.id]
        : []
  );
}

export function getTaxonomySubCategoryOptions(args: {
  subCategories: TaxonomySubCategoryItem[];
  categoryId: string | null;
  excludedIds?: ReadonlySet<string>;
}) {
  const { subCategories, categoryId, excludedIds = new Set() } = args;
  return subCategories
    .filter(
      (subCategory) =>
        subCategory.categoryId === categoryId &&
        !excludedIds.has(subCategory.id)
    )
    .map((subCategory) => ({
      value: subCategory.id,
      label: subCategory.name,
    }));
}

export function resolveTaxonomyDeleteRuleHandling(args: {
  selected: 'delete' | 'reassign' | null;
  target: TaxonomyDeleteTarget | null;
  affectedRuleCount: number;
}) {
  const { selected, target, affectedRuleCount } = args;
  return (
    selected ??
    (target?.kind === 'subcategory' && affectedRuleCount > 0
      ? 'reassign'
      : 'delete')
  );
}
