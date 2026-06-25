import { AppError } from '../../api/errors';
import type { CompanyId, Project, ProjectId } from '../../types';
import { asCompanyId } from '../../types';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { getCompanyRole, projectSelectFields, toProject } from './projectCore';

export async function listProjectsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<Project[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
    if (!company) return [];

    const allRows = await db
      .selectFrom('projects')
      .select(projectSelectFields)
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute();

    const isSuperadmin = await isGlobalSuperadminUser(userId, db);
    if (isSuperadmin) {
      return allRows.filter((p) => p.allow_superadmin_access).map(toProject);
    }
    if (company.status === 'deactivated') return [];

    const companyRole = await getCompanyRole(userId, args.companyId);
    if (companyRole === 'admin' || companyRole === 'executive') {
      return allRows.map(toProject);
    }

    const isCompanyMember = !!companyRole;
    const membershipRows = await db
      .selectFrom('project_memberships')
      .select('project_id')
      .where('user_id', '=', userId)
      .execute();
    const mine = new Set(membershipRows.map((m) => m.project_id));

    return allRows
      .filter((p) => {
        if (p.status === 'archived') return false;
        if (mine.has(p.id)) return true;
        if (!isCompanyMember) return false;
        return p.visibility === 'company';
      })
      .map(toProject);
  });
}

export async function getProjectServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Project | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);
    const project = await db
      .selectFrom('projects')
      .select(projectSelectFields)
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) return null;

    if (isSuperadmin && !project.allow_superadmin_access) return null;

    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', project.company_id)
      .executeTakeFirst();
    if (!company) return null;

    if (company.status === 'deactivated' && !isSuperadmin) return null;
    if (project.status === 'archived' && !isSuperadmin) {
      const companyRole = await getCompanyRole(
        userId,
        asCompanyId(project.company_id)
      );
      if (companyRole !== 'admin' && companyRole !== 'executive') {
        throw new AppError('FORBIDDEN', 'Project is deactivated');
      }
    }

    await requireAuthorized({
      db,
      userId,
      action: 'project:view',
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
    });
    return toProject(project);
  });
}
