import { AppError } from '../../api/errors';
import type {
  CompanyId,
  CompanyMembership,
  CompanyRole,
  ProjectId,
  ProjectMembership,
  ProjectRole,
  UserId,
} from '../../types';
import { getDb } from '../db/db';
import { requireAuthorized } from '../auth/authorize';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

function toCompanyMembership(row: {
  company_id: string;
  user_id: string;
  role: 'superadmin' | 'admin' | 'executive' | 'management' | 'member';
}): CompanyMembership {
  return {
    companyId: row.company_id as CompanyId,
    userId: row.user_id as UserId,
    role: row.role,
  };
}

function toProjectMembership(row: {
  project_id: string;
  user_id: string;
  role: 'owner' | 'lead' | 'member' | 'viewer';
}): ProjectMembership {
  return {
    projectId: row.project_id as ProjectId,
    userId: row.user_id as UserId,
    role: row.role,
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

export async function listCompanyMembershipsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyMembership[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'company:view',
      companyId: args.companyId,
    });

    const rows = await db
      .selectFrom('company_memberships')
      .select(['company_id', 'user_id', 'role'])
      .where('company_id', '=', args.companyId)
      .execute();
    return rows.map(toCompanyMembership);
  });
}

export async function listAllCompanyMembershipsServer(args: {
  context: ServerFnContextInput;
}): Promise<CompanyMembership[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isSuperadminUser(userId);

    if (isSuperadmin) {
      const rows = await db
        .selectFrom('company_memberships')
        .select(['company_id', 'user_id', 'role'])
        .execute();
      return rows.map(toCompanyMembership);
    }

    const companyRows = await db
      .selectFrom('company_memberships')
      .select('company_id')
      .where('user_id', '=', userId)
      .execute();
    const companyIds = companyRows.map((r) => r.company_id);
    if (!companyIds.length) return [];

    const rows = await db
      .selectFrom('company_memberships')
      .select(['company_id', 'user_id', 'role'])
      .where('company_id', 'in', companyIds)
      .execute();

    return rows.map(toCompanyMembership);
  });
}

export async function upsertCompanyMembershipServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  userId: UserId;
  role: CompanyRole;
}): Promise<CompanyMembership> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const sessionUserId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId: sessionUserId,
      action: 'company:manage_members',
      companyId: args.companyId,
    });

    const userExists = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', args.userId)
      .executeTakeFirst();
    if (!userExists) throw new AppError('NOT_FOUND', 'Unknown user');

    const existingMembership = await db
      .selectFrom('company_memberships')
      .select(['role'])
      .where('company_id', '=', args.companyId)
      .where('user_id', '=', args.userId)
      .executeTakeFirst();

    if (existingMembership?.role === 'admin' && args.role !== 'admin') {
      const adminCountRow = await db
        .selectFrom('company_memberships')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('company_id', '=', args.companyId)
        .where('role', '=', 'admin')
        .executeTakeFirstOrThrow();

      if (Number(adminCountRow.count) <= 1) {
        throw new AppError('VALIDATION_ERROR', 'Company must retain at least one admin');
      }
    }

    await db
      .insertInto('company_memberships')
      .values({
        company_id: args.companyId,
        user_id: args.userId,
        role: args.role,
      })
      .onConflict((oc) =>
        oc.columns(['company_id', 'user_id']).doUpdateSet({
          role: args.role,
        })
      )
      .execute();

    return {
      companyId: args.companyId,
      userId: args.userId,
      role: args.role,
    };
  });
}

export async function deleteCompanyMembershipServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  userId: UserId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const sessionUserId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId: sessionUserId,
      action: 'company:manage_members',
      companyId: args.companyId,
    });

    const existingMembership = await db
      .selectFrom('company_memberships')
      .select(['role'])
      .where('company_id', '=', args.companyId)
      .where('user_id', '=', args.userId)
      .executeTakeFirst();

    if (existingMembership?.role === 'admin') {
      const adminCountRow = await db
        .selectFrom('company_memberships')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('company_id', '=', args.companyId)
        .where('role', '=', 'admin')
        .executeTakeFirstOrThrow();

      if (Number(adminCountRow.count) <= 1) {
        throw new AppError('VALIDATION_ERROR', 'Company must retain at least one admin');
      }
    }

    await db.transaction().execute(async (trx) => {
      const projectIds = await trx
        .selectFrom('projects')
        .select('id')
        .where('company_id', '=', args.companyId)
        .execute();

      if (projectIds.length) {
        await trx
          .deleteFrom('project_memberships')
          .where('user_id', '=', args.userId)
          .where(
            'project_id',
            'in',
            projectIds.map((p) => p.id)
          )
          .execute();
      }

      await trx
        .deleteFrom('company_memberships')
        .where('company_id', '=', args.companyId)
        .where('user_id', '=', args.userId)
        .execute();
    });
  });
}

export async function listProjectMembershipsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ProjectMembership[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Unknown project');

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'project:view',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    const rows = await db
      .selectFrom('project_memberships')
      .select(['project_id', 'user_id', 'role'])
      .where('project_id', '=', args.projectId)
      .execute();
    return rows.map(toProjectMembership);
  });
}

export async function listMyProjectMembershipsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<ProjectMembership[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isSuperadminUser(userId);
    const projectIdsInCompany = await db
      .selectFrom('projects')
      .select(['id', 'allow_superadmin_access'])
      .where('company_id', '=', args.companyId)
      .execute();
    if (!projectIdsInCompany.length) return [];
    const ids = projectIdsInCompany
      .filter((p) => !isSuperadmin || p.allow_superadmin_access)
      .map((p) => p.id);
    if (!ids.length) return [];

    const rows = await db
      .selectFrom('project_memberships')
      .select(['project_id', 'user_id', 'role'])
      .where('user_id', '=', userId)
      .where('project_id', 'in', ids)
      .execute();
    return rows.map(toProjectMembership);
  });
}

export async function upsertProjectMembershipServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  userId: UserId;
  role: ProjectRole;
}): Promise<ProjectMembership> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Unknown project');

    const sessionUserId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId: sessionUserId,
      action: 'project:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    const userExists = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', args.userId)
      .executeTakeFirst();
    if (!userExists) throw new AppError('NOT_FOUND', 'Unknown user');

    await db
      .insertInto('project_memberships')
      .values({
        project_id: args.projectId,
        user_id: args.userId,
        role: args.role,
      })
      .onConflict((oc) =>
        oc.columns(['project_id', 'user_id']).doUpdateSet({
          role: args.role,
        })
      )
      .execute();

    return {
      projectId: args.projectId,
      userId: args.userId,
      role: args.role,
    };
  });
}

export async function deleteProjectMembershipServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  userId: UserId;
  role: ProjectRole;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Unknown project');

    const sessionUserId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId: sessionUserId,
      action: 'project:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    await db
      .deleteFrom('project_memberships')
      .where('project_id', '=', args.projectId)
      .where('user_id', '=', args.userId)
      .where('role', '=', args.role)
      .execute();
  });
}
