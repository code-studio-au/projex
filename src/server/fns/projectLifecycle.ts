import { AppError } from '../../api/errors';
import type { ProjectId } from '../../types';
import { asCompanyId } from '../../types';
import { requireAuthorized } from '../auth/authorize';
import { recordAuditEvent } from '../audit/auditEvents';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

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
      action: 'project:lifecycle',
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
    });
    if (project.status === 'archived') return;

    await db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      await trx
        .updateTable('projects')
        .set({ status: 'archived', deactivated_at: now })
        .where('id', '=', args.projectId)
        .execute();
      await recordAuditEvent({
        db: trx,
        companyId: asCompanyId(project.company_id),
        projectId: args.projectId,
        actorUserId: userId,
        eventClass: 'lifecycle',
        eventType: 'project.deactivated',
        entityType: 'project',
        entityId: args.projectId,
        reason: 'Deactivated project',
        previousState: { status: project.status },
        resultingState: { status: 'archived' },
        nowIso: now,
      });
    });
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
      action: 'project:lifecycle',
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
    });

    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', project.company_id)
      .executeTakeFirst();
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status !== 'active') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Company must be active to reactivate a project'
      );
    }
    if (project.status === 'active') return;

    await db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      await trx
        .updateTable('projects')
        .set({ status: 'active', deactivated_at: null })
        .where('id', '=', args.projectId)
        .execute();
      await recordAuditEvent({
        db: trx,
        companyId: asCompanyId(project.company_id),
        projectId: args.projectId,
        actorUserId: userId,
        eventClass: 'lifecycle',
        eventType: 'project.reactivated',
        entityType: 'project',
        entityId: args.projectId,
        reason: 'Reactivated project',
        previousState: { status: project.status },
        resultingState: { status: 'active' },
        nowIso: now,
      });
    });
  });
}

export async function deleteProjectServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  confirmation: string;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id', 'name', 'status'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'project:lifecycle',
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
    });

    if (args.confirmation.trim() !== `DELETE ${project.name}`) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Confirmation text does not match the project name'
      );
    }

    if (project.status !== 'archived') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Project must be deactivated before deletion'
      );
    }

    await db.transaction().execute(async (trx) => {
      await recordAuditEvent({
        db: trx,
        companyId: asCompanyId(project.company_id),
        projectId: args.projectId,
        actorUserId: userId,
        eventClass: 'lifecycle',
        eventType: 'project.deleted',
        entityType: 'project',
        entityId: args.projectId,
        reason: 'Permanently deleted archived project',
        previousState: { name: project.name, status: project.status },
        resultingState: { deleted: true },
      });
      await trx
        .deleteFrom('projects')
        .where('id', '=', args.projectId)
        .execute();
    });
  });
}
