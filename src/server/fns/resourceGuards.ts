import type { Kysely } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  CategoryId,
  CompanyDefaultMappingRuleId,
  CompanyId,
  ProjectId,
  SubCategoryId,
  UserId,
} from '../../types';
import type { Action } from '../../utils/auth';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import { requireServerUserId, type ServerFnContextInput } from './runtime';

export type ProjectActionContext = {
  db: Kysely<DB>;
  userId: UserId;
  companyId: CompanyId;
  projectId: ProjectId;
};

export async function requireProjectForAction(
  context: ServerFnContextInput,
  projectId: ProjectId,
  action: Action,
  db: Kysely<DB> = getDb()
): Promise<ProjectActionContext> {
  const userId = await requireServerUserId(context);
  const project = await db
    .selectFrom('projects')
    .select(['id', 'company_id'])
    .where('id', '=', projectId)
    .executeTakeFirst();

  if (!project) throw new AppError('NOT_FOUND', 'Unknown project');

  const companyId = project.company_id as CompanyId;
  await requireAuthorized({ db, userId, action, companyId, projectId });
  return { db, userId, companyId, projectId };
}

export async function requireCompanyMember(params: {
  db: Kysely<DB>;
  companyId: CompanyId;
  userId: UserId;
}): Promise<void> {
  const membership = await params.db
    .selectFrom('company_memberships')
    .select('user_id')
    .where('company_id', '=', params.companyId)
    .where('user_id', '=', params.userId)
    .executeTakeFirst();

  if (!membership) {
    throw new AppError(
      'VALIDATION_ERROR',
      'User must be a company member before being added to a project'
    );
  }
}

export async function assertCategoryInProject(params: {
  db: Kysely<DB>;
  projectId: ProjectId;
  categoryId: CategoryId;
}): Promise<void> {
  const category = await params.db
    .selectFrom('categories')
    .select('id')
    .where('project_id', '=', params.projectId)
    .where('id', '=', params.categoryId)
    .executeTakeFirst();

  if (!category) throw new AppError('NOT_FOUND', 'Unknown category');
}

export async function assertSubCategoryInProject(params: {
  db: Kysely<DB>;
  projectId: ProjectId;
  subCategoryId: SubCategoryId;
  categoryId?: CategoryId;
}): Promise<void> {
  const subCategory = await params.db
    .selectFrom('sub_categories')
    .select(['id', 'category_id'])
    .where('project_id', '=', params.projectId)
    .where('id', '=', params.subCategoryId)
    .executeTakeFirst();

  if (!subCategory) throw new AppError('NOT_FOUND', 'Unknown subcategory');

  if (params.categoryId && subCategory.category_id !== params.categoryId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Subcategory does not belong to category'
    );
  }
}

export async function assertCompanyDefaultMappingRuleInCompany(params: {
  db: Kysely<DB>;
  companyId: CompanyId;
  ruleId: CompanyDefaultMappingRuleId;
}): Promise<void> {
  const rule = await params.db
    .selectFrom('company_default_mapping_rules')
    .select('id')
    .where('company_id', '=', params.companyId)
    .where('id', '=', params.ruleId)
    .executeTakeFirst();

  if (!rule)
    throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');
}
