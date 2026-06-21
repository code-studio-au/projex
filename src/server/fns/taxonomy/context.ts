import { AppError } from '../../../api/errors';
import type { CompanyId, ProjectId } from '../../../types';
import { asCompanyId } from '../../../types';
import { requireAuthorized } from '../../auth/authorize';
import { getDb } from '../../db/db';
import { requireServerUserId, type ServerFnContextInput } from '../runtime';

export async function requireProjectTaxonomyContext(
  context: ServerFnContextInput,
  projectId: ProjectId,
  action: 'project:view' | 'taxonomy:edit'
): Promise<{ companyId: CompanyId }> {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const project = await db
    .selectFrom('projects')
    .select(['id', 'company_id', 'project_type'])
    .where('id', '=', projectId)
    .executeTakeFirst();
  if (!project) throw new AppError('NOT_FOUND', 'Unknown project');
  if (project.project_type !== 'project') {
    throw new AppError(
      'VALIDATION_ERROR',
      'Programmes are reporting-only and cannot be used for project operations'
    );
  }
  const companyId = asCompanyId(project.company_id);
  await requireAuthorized({ db, userId, action, companyId, projectId });
  return { companyId };
}

export async function requireCompanyTaxonomyContext(
  context: ServerFnContextInput,
  companyId: CompanyId,
  action: 'company:view' | 'company:manage_defaults'
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const company = await db
    .selectFrom('companies')
    .select('id')
    .where('id', '=', companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');
  await requireAuthorized({ db, userId, action, companyId });
  return userId;
}
