export type TaxonomyDeleteTarget = {
  kind: 'category' | 'subcategory';
  id: string;
  name: string;
};

export type TaxonomySubCategoryActionTarget = {
  subCategoryId: string;
  subCategoryName: string;
  currentCategoryId: string;
};
