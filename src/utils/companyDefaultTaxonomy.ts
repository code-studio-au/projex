import type {
  Category,
  CategoryId,
  CompanyDefaultCategory,
  CompanyDefaultSubCategory,
  CompanyId,
  ProjectId,
  SubCategory,
  SubCategoryId,
} from '../types';
import type { ApplyCompanyDefaultsResult } from '../api/types';

type ProjectCategoryInput = Pick<Category, 'id' | 'name'>;
type ProjectSubCategoryInput = Pick<SubCategory, 'categoryId' | 'name'>;

function taxonomyNameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function planApplyCompanyDefaultTaxonomy(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  defaultCategories: CompanyDefaultCategory[];
  defaultSubCategories: CompanyDefaultSubCategory[];
  projectCategories: ProjectCategoryInput[];
  projectSubCategories: ProjectSubCategoryInput[];
  createCategoryId: () => CategoryId;
  createSubCategoryId: () => SubCategoryId;
  nowIso: string;
}): {
  result: ApplyCompanyDefaultsResult;
  categoriesToCreate: Category[];
  subCategoriesToCreate: SubCategory[];
} {
  const categoryIdByName = new Map(
    args.projectCategories.map((category) => [taxonomyNameKey(category.name), category.id])
  );
  const subCategoryNamesByCategoryId = new Map<CategoryId, Set<string>>();

  for (const subCategory of args.projectSubCategories) {
    const names =
      subCategoryNamesByCategoryId.get(subCategory.categoryId) ?? new Set<string>();
    names.add(taxonomyNameKey(subCategory.name));
    subCategoryNamesByCategoryId.set(subCategory.categoryId, names);
  }

  const categoriesToCreate: Category[] = [];
  const subCategoriesToCreate: SubCategory[] = [];

  for (const defaultCategory of args.defaultCategories) {
    const categoryKey = taxonomyNameKey(defaultCategory.name);
    let projectCategoryId = categoryIdByName.get(categoryKey);

    if (!projectCategoryId) {
      projectCategoryId = args.createCategoryId();
      categoriesToCreate.push({
        id: projectCategoryId,
        companyId: args.companyId,
        projectId: args.projectId,
        name: defaultCategory.name,
        createdAt: args.nowIso,
        updatedAt: args.nowIso,
      });
      categoryIdByName.set(categoryKey, projectCategoryId);
      subCategoryNamesByCategoryId.set(projectCategoryId, new Set<string>());
    }

    const existingSubNames =
      subCategoryNamesByCategoryId.get(projectCategoryId) ?? new Set<string>();

    for (const defaultSubCategory of args.defaultSubCategories) {
      if (defaultSubCategory.companyDefaultCategoryId !== defaultCategory.id) continue;

      const subCategoryKey = taxonomyNameKey(defaultSubCategory.name);
      if (existingSubNames.has(subCategoryKey)) continue;

      subCategoriesToCreate.push({
        id: args.createSubCategoryId(),
        companyId: args.companyId,
        projectId: args.projectId,
        categoryId: projectCategoryId,
        name: defaultSubCategory.name,
        createdAt: args.nowIso,
        updatedAt: args.nowIso,
      });
      existingSubNames.add(subCategoryKey);
    }

    subCategoryNamesByCategoryId.set(projectCategoryId, existingSubNames);
  }

  return {
    result: {
      companyDefaultsConfigured: args.defaultCategories.length > 0,
      categoriesAdded: categoriesToCreate.length,
      subCategoriesAdded: subCategoriesToCreate.length,
    },
    categoriesToCreate,
    subCategoriesToCreate,
  };
}
