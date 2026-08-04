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
import { asCompanyId, asProjectId, asUserId } from '../../types';
import { getDb } from '../db/db';
import { executeAuditedTransaction } from '../db/auditedTransaction';
import { recordAuditLogEvent } from '../logging/auditLogger';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { requireCompanyMember } from './resourceGuards';

function toCompanyMembership(row: {
  company_id: string;
  user_id: string;
  role: 'admin' | 'executive' | 'management' | 'member';
}): CompanyMembership {
  return {
    companyId: asCompanyId(row.company_id),
    userId: asUserId(row.user_id),
    role: row.role,
  };
}

function toProjectMembership(row: {
  project_id: string;
  user_id: string;
  role: 'owner' | 'lead' | 'member' | 'viewer';
}): ProjectMembership {
  return {
    projectId: asProjectId(row.project_id),
    userId: asUserId(row.user_id),
    role: row.role,
  };
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
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (isSuperadmin) {
      const rows = await db
        .selectFrom('company_memberships')
        .select(['company_id', 'user_id', 'role'])
        .execute();
      return rows.map(toCompanyMembership);
    }

    const companyRows = await db
      .selectFrom('company_memberships')
      .innerJoin('companies', 'companies.id', 'company_memberships.company_id')
      .select('company_memberships.company_id')
      .where('user_id', '=', userId)
      .where('companies.status', '=', 'active')
      .execute();
    const companyIds = companyRows.map((r) => r.company_id);
    if (!companyIds.length) return [];

    const rows = await db
      .selectFrom('company_memberships')
      .innerJoin('companies', 'companies.id', 'company_memberships.company_id')
      .select(['company_id', 'user_id', 'role'])
      .where('company_id', 'in', companyIds)
      .where('companies.status', '=', 'active')
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

    await executeAuditedTransaction(db, async (trx) => {
      await trx
        .selectFrom('companies')
        .select('id')
        .where('id', '=', args.companyId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const existingMembership = await trx
        .selectFrom('company_memberships')
        .select(['role'])
        .where('company_id', '=', args.companyId)
        .where('user_id', '=', args.userId)
        .executeTakeFirst();

      if (existingMembership?.role === args.role) return;

      if (existingMembership?.role === 'admin' && args.role !== 'admin') {
        const adminCountRow = await trx
          .selectFrom('company_memberships')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('company_id', '=', args.companyId)
          .where('role', '=', 'admin')
          .executeTakeFirstOrThrow();

        if (Number(adminCountRow.count) <= 1) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Company must retain at least one admin'
          );
        }
      }

      await trx
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

      await recordAuditLogEvent({
        companyId: args.companyId,
        actorUserId: sessionUserId,
        eventClass: 'membership',
        eventType: existingMembership
          ? 'company_membership.role_changed'
          : 'company_membership.created',
        entityType: 'company_membership',
        entityId: `${args.companyId}:${args.userId}`,
        reasonCode: existingMembership
          ? `${existingMembership.role}_to_${args.role}`
          : `assigned_${args.role}`,
      });
    });

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
    if (sessionUserId === args.userId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'You cannot remove your own company membership'
      );
    }

    await executeAuditedTransaction(db, async (trx) => {
      await trx
        .selectFrom('companies')
        .select('id')
        .where('id', '=', args.companyId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const existingMembership = await trx
        .selectFrom('company_memberships')
        .select(['role'])
        .where('company_id', '=', args.companyId)
        .where('user_id', '=', args.userId)
        .executeTakeFirst();
      if (!existingMembership) return;

      if (existingMembership.role === 'admin') {
        const adminCountRow = await trx
          .selectFrom('company_memberships')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('company_id', '=', args.companyId)
          .where('role', '=', 'admin')
          .executeTakeFirstOrThrow();

        if (Number(adminCountRow.count) <= 1) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Company must retain at least one admin'
          );
        }
      }

      const projectIds = await trx
        .selectFrom('projects')
        .select('id')
        .where('company_id', '=', args.companyId)
        .orderBy('id')
        .forUpdate()
        .execute();

      if (projectIds.length) {
        const projectIdValues = projectIds.map((project) => project.id);
        const targetOwnerProjects = await trx
          .selectFrom('project_memberships')
          .select('project_id')
          .where('user_id', '=', args.userId)
          .where('role', '=', 'owner')
          .where('project_id', 'in', projectIdValues)
          .execute();

        if (targetOwnerProjects.length) {
          const ownerCounts = await trx
            .selectFrom('project_memberships')
            .select([
              'project_id',
              (eb) => eb.fn.countAll<number>().as('count'),
            ])
            .where(
              'project_id',
              'in',
              targetOwnerProjects.map((project) => project.project_id)
            )
            .where('role', '=', 'owner')
            .groupBy('project_id')
            .execute();

          if (ownerCounts.some((row) => Number(row.count) <= 1)) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Project must retain at least one owner'
            );
          }
        }

        await trx
          .deleteFrom('project_memberships')
          .where('user_id', '=', args.userId)
          .where('project_id', 'in', projectIdValues)
          .execute();
      }

      await trx
        .deleteFrom('company_memberships')
        .where('company_id', '=', args.companyId)
        .where('user_id', '=', args.userId)
        .execute();

      await recordAuditLogEvent({
        companyId: args.companyId,
        actorUserId: sessionUserId,
        eventClass: 'membership',
        eventType: 'company_membership.removed',
        entityType: 'company_membership',
        entityId: `${args.companyId}:${args.userId}`,
        reasonCode: `removed_${existingMembership.role}`,
      });
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
      companyId: asCompanyId(project.company_id),
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
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);
    const projectIdsInCompany = await db
      .selectFrom('projects')
      .select(['id', 'allow_superadmin_access'])
      .where('company_id', '=', args.companyId)
      .execute();
    if (!projectIdsInCompany.length) return [];
    const ids = projectIdsInCompany.flatMap((project) =>
      !isSuperadmin || project.allow_superadmin_access ? [project.id] : []
    );
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
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
    });

    const userExists = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', args.userId)
      .executeTakeFirst();
    if (!userExists) throw new AppError('NOT_FOUND', 'Unknown user');
    await requireCompanyMember({
      db,
      companyId: asCompanyId(project.company_id),
      userId: args.userId,
    });

    await executeAuditedTransaction(db, async (trx) => {
      await trx
        .selectFrom('projects')
        .select('id')
        .where('id', '=', args.projectId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const existingMembership = await trx
        .selectFrom('project_memberships')
        .select('role')
        .where('project_id', '=', args.projectId)
        .where('user_id', '=', args.userId)
        .executeTakeFirst();
      if (existingMembership?.role === args.role) return;

      const ownerCountRow = await trx
        .selectFrom('project_memberships')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('project_id', '=', args.projectId)
        .where('role', '=', 'owner')
        .executeTakeFirstOrThrow();
      const ownerCount = Number(ownerCountRow.count);
      if (
        (existingMembership?.role === 'owner' &&
          args.role !== 'owner' &&
          ownerCount <= 1) ||
        (ownerCount === 0 && args.role !== 'owner')
      ) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Project must retain at least one owner'
        );
      }

      await trx
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

      await recordAuditLogEvent({
        companyId: asCompanyId(project.company_id),
        projectId: args.projectId,
        actorUserId: sessionUserId,
        eventClass: 'membership',
        eventType: existingMembership
          ? 'project_membership.role_changed'
          : 'project_membership.created',
        entityType: 'project_membership',
        entityId: `${args.projectId}:${args.userId}`,
        reasonCode: existingMembership
          ? `${existingMembership.role}_to_${args.role}`
          : `assigned_${args.role}`,
      });
    });

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
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
    });

    await executeAuditedTransaction(db, async (trx) => {
      await trx
        .selectFrom('projects')
        .select('id')
        .where('id', '=', args.projectId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const existingMembership = await trx
        .selectFrom('project_memberships')
        .select('role')
        .where('project_id', '=', args.projectId)
        .where('user_id', '=', args.userId)
        .executeTakeFirst();
      if (!existingMembership || existingMembership.role !== args.role) return;

      if (existingMembership.role === 'owner') {
        const ownerCountRow = await trx
          .selectFrom('project_memberships')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('project_id', '=', args.projectId)
          .where('role', '=', 'owner')
          .executeTakeFirstOrThrow();
        if (Number(ownerCountRow.count) <= 1) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Project must retain at least one owner'
          );
        }
      }

      await trx
        .deleteFrom('project_memberships')
        .where('project_id', '=', args.projectId)
        .where('user_id', '=', args.userId)
        .where('role', '=', args.role)
        .execute();

      await recordAuditLogEvent({
        companyId: asCompanyId(project.company_id),
        projectId: args.projectId,
        actorUserId: sessionUserId,
        eventClass: 'membership',
        eventType: 'project_membership.removed',
        entityType: 'project_membership',
        entityId: `${args.projectId}:${args.userId}`,
        reasonCode: `removed_${existingMembership.role}`,
      });
    });
  });
}
