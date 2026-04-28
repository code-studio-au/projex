import type {
  Category,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  ProjectId,
  SubCategory,
} from '../../types';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asSubCategoryId,
} from '../../types';

export type CategoryRow = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SubCategoryRow = {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyDefaultCategoryRow = {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyDefaultSubCategoryRow = {
  id: string;
  company_id: string;
  company_default_category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyDefaultMappingRuleRow = {
  id: string;
  company_id: string;
  match_text: string;
  company_default_category_id: string;
  company_default_sub_category_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function toCategory(row: CategoryRow): Category {
  return {
    id: asCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    projectId: row.project_id as ProjectId,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSubCategory(row: SubCategoryRow): SubCategory {
  return {
    id: asSubCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    projectId: row.project_id as ProjectId,
    categoryId: asCategoryId(row.category_id),
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCompanyDefaultCategory(
  row: CompanyDefaultCategoryRow
): CompanyDefaultCategory {
  return {
    id: asCompanyDefaultCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCompanyDefaultSubCategory(
  row: CompanyDefaultSubCategoryRow
): CompanyDefaultSubCategory {
  return {
    id: asCompanyDefaultSubCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    companyDefaultCategoryId: asCompanyDefaultCategoryId(
      row.company_default_category_id
    ),
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCompanyDefaultMappingRule(
  row: CompanyDefaultMappingRuleRow
): CompanyDefaultMappingRule {
  return {
    id: asCompanyDefaultMappingRuleId(row.id),
    companyId: row.company_id as CompanyId,
    matchText: row.match_text,
    companyDefaultCategoryId: asCompanyDefaultCategoryId(
      row.company_default_category_id
    ),
    companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
      row.company_default_sub_category_id
    ),
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
