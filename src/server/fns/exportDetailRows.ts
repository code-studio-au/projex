import type { WorksheetRowValue } from './exportWorkbookShared';
import { centsToMajorUnits } from './exportWorkbookShared';

export function buildBudgetRows(args: {
  budgetLines: Array<{
    id: string;
    project_id: string;
    category_id: string | null;
    sub_category_id: string | null;
    allocated_cents: number | string | bigint;
    created_at: string;
    updated_at: string;
  }>;
  projectById: Map<
    string,
    {
      name: string;
      currency: string;
      parent_project_id: string | null;
    }
  >;
  categoryById: Map<string, { name: string }>;
  subCategoryById: Map<string, { name: string }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.budgetLines.map((row) => {
    const project = args.projectById.get(row.project_id);
    const category = row.category_id
      ? args.categoryById.get(row.category_id)
      : null;
    const subCategory = row.sub_category_id
      ? args.subCategoryById.get(row.sub_category_id)
      : null;
    const parentProgramme = project?.parent_project_id
      ? args.projectById.get(project.parent_project_id)
      : null;
    return {
      budgetId: row.id,
      projectId: row.project_id,
      projectName: project?.name ?? '',
      programmeId: parentProgramme ? (project?.parent_project_id ?? '') : '',
      programmeName: parentProgramme?.name ?? '',
      currency: project?.currency ?? '',
      categoryId: row.category_id ?? '',
      categoryName: category?.name ?? '',
      subCategoryId: row.sub_category_id ?? '',
      subCategoryName: subCategory?.name ?? '',
      allocatedCents: Number(row.allocated_cents),
      allocatedAmount: centsToMajorUnits(Number(row.allocated_cents)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function buildCategoryRows(args: {
  categories: Array<{
    id: string;
    project_id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>;
  projectById: Map<string, { name: string; parent_project_id: string | null }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.categories.map((row) => {
    const project = args.projectById.get(row.project_id);
    const parentProgramme = project?.parent_project_id
      ? args.projectById.get(project.parent_project_id)
      : null;
    return {
      categoryId: row.id,
      projectId: row.project_id,
      projectName: project?.name ?? '',
      programmeId: parentProgramme ? (project?.parent_project_id ?? '') : '',
      programmeName: parentProgramme?.name ?? '',
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function buildSubCategoryRows(args: {
  subCategories: Array<{
    id: string;
    project_id: string;
    category_id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>;
  projectById: Map<string, { name: string }>;
  categoryById: Map<string, { name: string }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.subCategories.map((row) => ({
    subCategoryId: row.id,
    projectId: row.project_id,
    projectName: args.projectById.get(row.project_id)?.name ?? '',
    categoryId: row.category_id,
    categoryName: args.categoryById.get(row.category_id)?.name ?? '',
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function buildDefaultMappingRuleRows(args: {
  companyDefaultMappingRules: Array<{
    id: string;
    match_text: string;
    company_default_category_id: string;
    company_default_sub_category_id: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>;
  defaultCategoryById: Map<string, { name: string }>;
  defaultSubCategoryById: Map<string, { name: string }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.companyDefaultMappingRules.map((row) => ({
    ruleId: row.id,
    matchText: row.match_text,
    categoryId: row.company_default_category_id,
    categoryName:
      args.defaultCategoryById.get(row.company_default_category_id)?.name ?? '',
    subCategoryId: row.company_default_sub_category_id,
    subCategoryName:
      args.defaultSubCategoryById.get(row.company_default_sub_category_id)
        ?.name ?? '',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function buildImportRuleRows(args: {
  importRules: Array<{
    id: string;
    project_id: string | null;
    name: string;
    action: string;
    field: string;
    operator: string;
    value: string;
    sort_order: number;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.importRules.map((row) => ({
    ruleId: row.id,
    scope: row.project_id ? 'project' : 'company',
    projectId: row.project_id ?? '',
    name: row.name,
    action: row.action,
    field: row.field,
    operator: row.operator,
    value: row.value,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function buildCompanyMemberRows(args: {
  companyMembers: Array<{
    user_id: string;
    user_name: string;
    user_email: string;
    role: string;
    user_disabled: boolean;
    is_global_superadmin: boolean;
  }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.companyMembers.map((row) => ({
    userId: row.user_id,
    name: row.user_name,
    email: row.user_email,
    role: row.role,
    disabled: row.user_disabled,
    isGlobalSuperadmin: row.is_global_superadmin,
  }));
}

export function buildProjectMembershipRows(args: {
  projectMemberships: Array<{
    project_id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    role: string;
  }>;
  projectById: Map<string, { name: string; project_type: string }>;
}): Array<Record<string, WorksheetRowValue>> {
  return args.projectMemberships.map((row) => ({
    projectId: row.project_id,
    projectName: args.projectById.get(row.project_id)?.name ?? '',
    projectType: args.projectById.get(row.project_id)?.project_type ?? '',
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    role: row.role,
  }));
}
