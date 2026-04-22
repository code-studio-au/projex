import { AppError } from '../../api/errors';
import type { ProjectCreateInput, ProjectUpdateInput } from '../../api/types';
import type { CompanyId, Project, ProjectId, UserId } from '../../types';
import { asProjectId } from '../../types';
import { uid } from '../../utils/id';
import { projectBudgetTotalCentsSchema, projectNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

type ProjectRow = {
  id: string;
  company_id: string;
  name: string;
  budget_total_cents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  deactivated_at: string | null;
  visibility: 'company' | 'private';
  allow_superadmin_access: boolean;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id as ProjectId,
    companyId: row.company_id as CompanyId,
    name: row.name,
    budgetTotalCents: Number(row.budget_total_cents),
    currency: row.currency,
    status: row.status,
    deactivatedAt: row.deactivated_at ?? undefined,
    visibility: row.visibility,
    allowSuperadminAccess: row.allow_superadmin_access,
  };
}

async function isSuperadminUser(userId: UserId): Promise<boolean> {
  const db = getDb();
  const row = await db
    .selectFrom('company_memberships')
    .select('user_id')
    .where('user_id', '=', userId)
    .where('role', '=', 'superadmin')
    .executeTakeFirst();
  return !!row;
}

async function getCompanyRole(userId: UserId, companyId: CompanyId) {
  const db = getDb();
  const row = await db
    .selectFrom('company_memberships')
    .select('role')
    .where('user_id', '=', userId)
    .where('company_id', '=', companyId)
    .executeTakeFirst();
  return row?.role ?? null;
}

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
      .select([
        'id',
        'company_id',
        'name',
        'budget_total_cents',
        'currency',
        'status',
        'deactivated_at',
        'visibility',
        'allow_superadmin_access',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute();

    const isSuperadmin = await isSuperadminUser(userId);
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
    const isSuperadmin = await isSuperadminUser(userId);
    const project = await db
      .selectFrom('projects')
      .select([
        'id',
        'company_id',
        'name',
        'budget_total_cents',
        'currency',
        'status',
        'deactivated_at',
        'visibility',
        'allow_superadmin_access',
      ])
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
      const cRole = await getCompanyRole(userId, project.company_id as CompanyId);
      if (cRole !== 'admin' && cRole !== 'executive') {
        throw new AppError('FORBIDDEN', 'Project is deactivated');
      }
    }

    await requireAuthorized({
      db,
      userId,
      action: 'project:view',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
    return toProject(project);
  });
}

export async function createProjectServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: ProjectCreateInput;
}): Promise<Project> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    validateOrThrow(projectNameSchema, args.input.name);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'company:edit',
      companyId: args.companyId,
    });

    const id = args.input.id ?? asProjectId(uid('prj'));
    const row = await db
      .insertInto('projects')
      .values({
        id,
        company_id: args.companyId,
        name: args.input.name.trim(),
        budget_total_cents: 0,
        currency: 'AUD',
        status: 'active',
        deactivated_at: null,
        visibility: 'private',
        allow_superadmin_access: true,
      })
      .returning([
        'id',
        'company_id',
        'name',
        'budget_total_cents',
        'currency',
        'status',
        'deactivated_at',
        'visibility',
        'allow_superadmin_access',
      ])
      .executeTakeFirstOrThrow();

    return toProject(row);
  });
}

export async function updateProjectServer(args: {
  context: ServerFnContextInput;
  input: ProjectUpdateInput;
}): Promise<Project> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const existing = await db
      .selectFrom('projects')
      .select([
        'id',
        'company_id',
        'name',
        'budget_total_cents',
        'currency',
        'status',
        'deactivated_at',
        'visibility',
        'allow_superadmin_access',
      ])
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown project');

    if (typeof args.input.name === 'string') {
      validateOrThrow(projectNameSchema, args.input.name);
    }
    if (typeof args.input.budgetTotalCents !== 'undefined') {
      validateOrThrow(projectBudgetTotalCentsSchema, args.input.budgetTotalCents);
    }

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'project:edit',
      companyId: existing.company_id as CompanyId,
      projectId: existing.id as ProjectId,
    });

    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') patch.name = args.input.name.trim();
    if (typeof args.input.budgetTotalCents !== 'undefined') {
      patch.budget_total_cents = args.input.budgetTotalCents;
    }
    if (typeof args.input.currency !== 'undefined') patch.currency = args.input.currency;
    if (typeof args.input.visibility !== 'undefined') patch.visibility = args.input.visibility;
    if (typeof args.input.allowSuperadminAccess !== 'undefined') {
      patch.allow_superadmin_access = args.input.allowSuperadminAccess;
    }

    if (!Object.keys(patch).length) return toProject(existing);

    const updated = await db
      .updateTable('projects')
      .set(patch)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'name',
        'budget_total_cents',
        'currency',
        'status',
        'deactivated_at',
        'visibility',
        'allow_superadmin_access',
      ])
      .executeTakeFirstOrThrow();
    return toProject(updated);
  });
}

export async function deactivateProjectServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id', 'status'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'company:edit',
      companyId: project.company_id as CompanyId,
    });
    if (project.status === 'archived') return;

    await db
      .updateTable('projects')
      .set({
        status: 'archived',
        deactivated_at: new Date().toISOString(),
      })
      .where('id', '=', args.projectId)
      .execute();
  });
}

export async function reactivateProjectServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id', 'status'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'company:edit',
      companyId: project.company_id as CompanyId,
    });

    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', project.company_id)
      .executeTakeFirst();
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status !== 'active') {
      throw new AppError('VALIDATION_ERROR', 'Company must be active to reactivate a project');
    }
    if (project.status === 'active') return;

    await db
      .updateTable('projects')
      .set({
        status: 'active',
        deactivated_at: null,
      })
      .where('id', '=', args.projectId)
      .execute();
  });
}

export async function deleteProjectServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id', 'status'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'company:edit',
      companyId: project.company_id as CompanyId,
    });

    if (project.status !== 'archived') {
      throw new AppError('VALIDATION_ERROR', 'Project must be deactivated before deletion');
    }

    await db.deleteFrom('projects').where('id', '=', args.projectId).execute();
  });
}
