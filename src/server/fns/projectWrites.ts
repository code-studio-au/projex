import { AppError } from '../../api/errors';
import type { ProjectCreateInput, ProjectUpdateInput } from '../../api/types';
import type { CompanyId, Project } from '../../types';
import { asCompanyId, asProjectId } from '../../types';
import { uid } from '../../utils/id';
import {
  projectBudgetTotalCentsSchema,
  projectNameSchema,
} from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
import { requireCompanyMember } from './resourceGuards';
import { applyCompanyStandardsToProject } from './taxonomy/standards';
import { recordAuditEvent } from '../audit/auditEvents';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  assertProjectTypeTransitionAllowed,
  assertValidProjectHierarchy,
  projectSelectFields,
  toProject,
} from './projectCore';

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
      action: 'project:create',
      companyId: args.companyId,
    });
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (isSuperadmin) {
      const eligibleOwnerRows = await db
        .selectFrom('company_memberships')
        .innerJoin('users', 'users.id', 'company_memberships.user_id')
        .select('company_memberships.user_id')
        .where('company_memberships.company_id', '=', args.companyId)
        .where('users.is_global_superadmin', '=', false)
        .execute();

      if (!eligibleOwnerRows.length) {
        throw new AppError(
          'VALIDATION_ERROR',
          'This company has no non-superadmin members yet. Add a company member before creating a project.'
        );
      }

      if (!args.input.initialOwnerUserId) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Superadmin must assign an initial project owner when creating a project.'
        );
      }

      const selectedOwner = await db
        .selectFrom('users')
        .select(['id', 'is_global_superadmin'])
        .where('id', '=', args.input.initialOwnerUserId)
        .executeTakeFirst();
      if (!selectedOwner) {
        throw new AppError('NOT_FOUND', 'Unknown initial project owner');
      }
      if (selectedOwner.is_global_superadmin) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Initial project owner must be a non-superadmin company member.'
        );
      }

      await requireCompanyMember({
        db,
        companyId: args.companyId,
        userId: args.input.initialOwnerUserId,
      });
    }

    const id = args.input.id ?? asProjectId(uid('prj'));
    const projectType = args.input.projectType ?? 'project';
    const parentProjectId = args.input.parentProjectId ?? null;
    const currency = args.input.currency ?? 'AUD';
    const applyCompanyStandards = args.input.applyCompanyStandards ?? true;
    await assertValidProjectHierarchy({
      db,
      companyId: args.companyId,
      projectId: id,
      projectType,
      currency,
      parentProjectId,
    });

    const row = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('projects')
        .values({
          id,
          company_id: args.companyId,
          name: args.input.name.trim(),
          project_type: projectType,
          parent_project_id: parentProjectId,
          budget_total_cents: 0,
          currency,
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          sync_company_defaults:
            projectType === 'project' ? applyCompanyStandards : false,
          allow_txn_transfers: false,
        })
        .returning(projectSelectFields)
        .executeTakeFirstOrThrow();

      if (isSuperadmin && args.input.initialOwnerUserId) {
        await trx
          .insertInto('project_memberships')
          .values({
            project_id: id,
            user_id: args.input.initialOwnerUserId,
            role: 'owner',
          })
          .onConflict((oc) =>
            oc.columns(['project_id', 'user_id']).doUpdateSet({
              role: 'owner',
            })
          )
          .execute();
      }

      if (projectType === 'project' && applyCompanyStandards) {
        await applyCompanyStandardsToProject({
          db: trx,
          companyId: args.companyId,
          projectId: id,
          actorUserId: isSuperadmin
            ? (args.input.initialOwnerUserId ?? userId)
            : userId,
        });
      }

      return created;
    });

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
      .select(projectSelectFields)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown project');

    if (typeof args.input.name === 'string') {
      validateOrThrow(projectNameSchema, args.input.name);
    }
    if (typeof args.input.budgetTotalCents !== 'undefined') {
      validateOrThrow(
        projectBudgetTotalCentsSchema,
        args.input.budgetTotalCents
      );
    }

    const userId = await requireServerUserId(args.context);
    const isHierarchyPatch =
      typeof args.input.projectType !== 'undefined' ||
      Object.prototype.hasOwnProperty.call(args.input, 'parentProjectId');
    const isTransferCapabilityPatch = Object.prototype.hasOwnProperty.call(
      args.input,
      'allowTxnTransfers'
    );
    const requiresCompanyEdit = isHierarchyPatch || isTransferCapabilityPatch;
    const requiresProjectEdit =
      Object.prototype.hasOwnProperty.call(args.input, 'name') ||
      Object.prototype.hasOwnProperty.call(args.input, 'budgetTotalCents') ||
      Object.prototype.hasOwnProperty.call(args.input, 'currency') ||
      Object.prototype.hasOwnProperty.call(args.input, 'visibility') ||
      Object.prototype.hasOwnProperty.call(
        args.input,
        'allowSuperadminAccess'
      ) ||
      Object.prototype.hasOwnProperty.call(args.input, 'syncCompanyDefaults');
    const companyId = asCompanyId(existing.company_id);
    const projectId = asProjectId(existing.id);

    if (requiresProjectEdit || (!requiresCompanyEdit && !requiresProjectEdit)) {
      await requireAuthorized({
        db,
        userId,
        action: 'project:edit',
        companyId,
        projectId,
      });
    }
    if (requiresCompanyEdit) {
      await requireAuthorized({
        db,
        userId,
        action: 'project:configure',
        companyId,
        projectId,
      });
    }

    const patch: Record<string, unknown> = {};
    const nextProjectType = args.input.projectType ?? existing.project_type;
    const nextCurrency = args.input.currency ?? existing.currency;
    const nextParentProjectId = Object.prototype.hasOwnProperty.call(
      args.input,
      'parentProjectId'
    )
      ? (args.input.parentProjectId ?? null)
      : existing.parent_project_id
        ? asProjectId(existing.parent_project_id)
        : null;

    await assertProjectTypeTransitionAllowed({
      db,
      projectId,
      currentType: existing.project_type,
      nextType: nextProjectType,
    });

    await assertValidProjectHierarchy({
      db,
      companyId,
      projectId,
      projectType: nextProjectType,
      currency: nextCurrency,
      parentProjectId: nextParentProjectId,
    });
    if (
      args.input.allowTxnTransfers === true &&
      nextProjectType === 'programme'
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Programmes are reporting-only and cannot transfer transactions'
      );
    }

    if (typeof args.input.name === 'string') {
      patch.name = args.input.name.trim();
    }
    if (typeof args.input.projectType !== 'undefined') {
      patch.project_type = args.input.projectType;
      if (args.input.projectType === 'programme') {
        patch.parent_project_id = null;
        patch.budget_total_cents = 0;
        patch.allow_txn_transfers = false;
      }
    }
    if (Object.prototype.hasOwnProperty.call(args.input, 'parentProjectId')) {
      patch.parent_project_id =
        nextProjectType === 'programme'
          ? null
          : (args.input.parentProjectId ?? null);
    }
    if (typeof args.input.budgetTotalCents !== 'undefined') {
      if (nextProjectType === 'programme') {
        throw new AppError(
          'VALIDATION_ERROR',
          'Programmes do not have their own budgets'
        );
      }
      patch.budget_total_cents = args.input.budgetTotalCents;
    }
    if (typeof args.input.currency !== 'undefined') {
      patch.currency = args.input.currency;
    }
    if (typeof args.input.visibility !== 'undefined') {
      patch.visibility = args.input.visibility;
    }
    if (typeof args.input.allowSuperadminAccess !== 'undefined') {
      patch.allow_superadmin_access = args.input.allowSuperadminAccess;
    }
    if (typeof args.input.syncCompanyDefaults !== 'undefined') {
      patch.sync_company_defaults =
        nextProjectType === 'project' ? args.input.syncCompanyDefaults : false;
    }
    if (typeof args.input.allowTxnTransfers !== 'undefined') {
      patch.allow_txn_transfers = args.input.allowTxnTransfers;
    }

    if (!Object.keys(patch).length) return toProject(existing);

    const updated = await db.transaction().execute(async (trx) => {
      const nextProject = await trx
        .updateTable('projects')
        .set(patch)
        .where('id', '=', args.input.id)
        .returning(projectSelectFields)
        .executeTakeFirstOrThrow();

      if (
        nextProjectType === 'project' &&
        args.input.syncCompanyDefaults === true
      ) {
        await applyCompanyStandardsToProject({
          db: trx,
          companyId,
          projectId,
          actorUserId: userId,
        });
      }

      if (typeof args.input.allowSuperadminAccess !== 'undefined') {
        await recordAuditEvent({
          db: trx,
          companyId,
          projectId,
          actorUserId: userId,
          eventClass: 'access',
          eventType: 'project.superadmin_access_changed',
          entityType: 'project',
          entityId: projectId,
          reason: 'Changed project superadmin access',
          previousState: {
            allowSuperadminAccess: existing.allow_superadmin_access,
          },
          resultingState: {
            allowSuperadminAccess: args.input.allowSuperadminAccess,
          },
        });
      }

      return nextProject;
    });

    return toProject(updated);
  });
}
