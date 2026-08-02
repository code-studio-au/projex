import type {
  ApplyCompanyStandardsResult,
  BulkRecodeProjectTransactionsInput,
  BulkRecodeProjectTransactionsResult,
  CategoryCreateInput,
  CategoryUpdateInput,
  PromoteProjectSubCategoryToCompanyDefaultInput,
  PromoteProjectSubCategoryToCompanyDefaultResult,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../../../api/types';
import type {
  Category,
  CompanyId,
  ProjectId,
  SubCategory,
} from '../../../types';
import { getDb } from '../../db/db';
import { executeAuditedTransaction } from '../../db/auditedTransaction';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  applyCompanyStandardsToProject,
  bulkRecodeProjectTransactions,
} from './standards';
import {
  createProjectCategory,
  createProjectSubCategory,
  deleteProjectCategory,
  deleteProjectSubCategory,
  listProjectCategories,
  listProjectSubCategories,
  updateProjectCategory,
  updateProjectSubCategory,
} from './projectCrud';
import { promoteProjectSubCategoryToCompanyDefault } from './projectPromotion';
import {
  requireCompanyTaxonomyContext,
  requireProjectTaxonomyContext,
} from './context';

export async function listCategoriesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Category[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'project:view'
    );
    return listProjectCategories(args.projectId);
  });
}

export async function createCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CategoryCreateInput;
}): Promise<Category> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    return createProjectCategory({
      companyId: companyId as CompanyId,
      projectId: args.projectId,
      input: args.input,
    });
  });
}

export async function updateCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CategoryUpdateInput;
}): Promise<Category> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    return updateProjectCategory({
      projectId: args.projectId,
      input: args.input,
    });
  });
}

export async function deleteCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  categoryId: Category['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    await deleteProjectCategory({
      projectId: args.projectId,
      categoryId: args.categoryId,
    });
  });
}

export async function listSubCategoriesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<SubCategory[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'project:view'
    );
    return listProjectSubCategories(args.projectId);
  });
}

export async function createSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: SubCategoryCreateInput;
}): Promise<SubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    return createProjectSubCategory({
      companyId: companyId as CompanyId,
      projectId: args.projectId,
      input: args.input,
    });
  });
}

export async function updateSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: SubCategoryUpdateInput;
}): Promise<SubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    return updateProjectSubCategory({
      projectId: args.projectId,
      input: args.input,
    });
  });
}

export async function deleteSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  subCategoryId: SubCategory['id'];
  replacementSubCategoryId?: SubCategory['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    await deleteProjectSubCategory({
      projectId: args.projectId,
      subCategoryId: args.subCategoryId,
      ...(args.replacementSubCategoryId
        ? { replacementSubCategoryId: args.replacementSubCategoryId }
        : {}),
    });
  });
}

export async function applyCompanyStandardsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ApplyCompanyStandardsResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const { companyId } = await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    return executeAuditedTransaction(getDb(), (trx) =>
      applyCompanyStandardsToProject({
        db: trx,
        companyId,
        projectId: args.projectId,
        actorUserId: userId,
      })
    );
  });
}

export async function bulkRecodeProjectTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: BulkRecodeProjectTransactionsInput;
}): Promise<BulkRecodeProjectTransactionsResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    return bulkRecodeProjectTransactions({
      db: getDb(),
      companyId,
      projectId: args.projectId,
      input: args.input,
    });
  });
}

export async function promoteProjectSubCategoryToCompanyDefaultServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: PromoteProjectSubCategoryToCompanyDefaultInput;
}): Promise<PromoteProjectSubCategoryToCompanyDefaultResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const { companyId } = await requireProjectTaxonomyContext(
      args.context,
      args.projectId,
      'project:view'
    );
    await requireCompanyTaxonomyContext(
      args.context,
      companyId,
      'company:manage_defaults'
    );
    return promoteProjectSubCategoryToCompanyDefault({
      companyId,
      projectId: args.projectId,
      subCategoryId: args.input.subCategoryId,
      actorUserId: userId,
    });
  });
}
