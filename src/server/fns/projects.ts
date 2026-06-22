import { AppError } from '../../api/errors';
import type { ProjectCreateInput, ProjectUpdateInput } from '../../api/types';
import type {
  CompanyId,
  Project,
  ProjectId,
  ProjectType,
  UserId,
} from '../../types';
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
  project_type: ProjectType;
  parent_project_id: string | null;
  budget_total_cents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  deactivated_at: string | null;
  visibility: 'company' | 'private';
  allow_superadmin_access: boolean;
  sync_company_defaults: boolean;
  allow_txn_transfers: boolean;
};

const projectSelectFields = [
  'id',
  'company_id',
  'name',
  'project_type',
  'parent_project_id',
  'budget_total_cents',
  'currency',
  'status',
  'deactivated_at',
  'visibility',
  'allow_superadmin_access',
  'sync_company_defaults',
  'allow_txn_transfers',
] as const;

function toProject(row: ProjectRow): Project {
  return {
    id: asProjectId(row.id),
    companyId: asCompanyId(row.company_id),
    name: row.name,
    projectType: row.project_type,
    parentProjectId: row.parent_project_id
      ? asProjectId(row.parent_project_id)
      : undefined,
    budgetTotalCents: Number(row.budget_total_cents),
    currency: row.currency,
    status: row.status,
    deactivatedAt: row.deactivated_at ?? undefined,
    visibility: row.visibility,
    allowSuperadminAccess: row.allow_superadmin_access,
    syncCompanyDefaults: row.sync_company_defaults,
    allowTxnTransfers: row.allow_txn_transfers,
  };
}

async function assertValidProjectHierarchy(args: {
  db: ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectId: ProjectId;
  projectType: ProjectType;
  currency: Project['currency'];
  parentProjectId?: ProjectId | null;
}) {
  if (args.projectType === 'programme') {
    if (args.parentProjectId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Programmes cannot be assigned to another programme'
      );
    }
    const childRows = await args.db
      .selectFrom('projects')
      .select(['id', 'currency'])
      .where('parent_project_id', '=', args.projectId)
      .execute();
    const mismatchedChild = childRows.find(
      (child) => child.currency !== args.currency
    );
    if (mismatchedChild) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Programme currency must match all assigned sub-projects'
      );
    }
    return;
  }

  if (!args.parentProjectId) return;
  if (args.parentProjectId === args.projectId) {
    throw new AppError('VALIDATION_ERROR', 'Project cannot parent itself');
  }

  const parent = await args.db
    .selectFrom('projects')
    .select(['id', 'company_id', 'project_type', 'status', 'currency'])
    .where('id', '=', args.parentProjectId)
    .executeTakeFirst();

  if (!parent) throw new AppError('NOT_FOUND', 'Unknown programme');
  if (parent.company_id !== args.companyId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Programme must belong to the same company'
    );
  }
  if (parent.project_type !== 'programme') {
    throw new AppError(
      'VALIDATION_ERROR',
      'Parent project must be a programme'
    );
  }
  if (parent.status !== 'active') {
    throw new AppError(
      'VALIDATION_ERROR',
      'Project can only be assigned to an active programme'
    );
  }
  if (parent.currency !== args.currency) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Project currency must match its programme currency'
    );
  }
}

async function assertProjectTypeTransitionAllowed(args: {
  db: ReturnType<typeof getDb>;
  projectId: ProjectId;
  currentType: ProjectType;
  nextType: ProjectType;
}) {
  if (args.currentType === args.nextType) return;

  if (args.currentType === 'programme' && args.nextType === 'project') {
    const child = await args.db
      .selectFrom('projects')
      .select('id')
      .where('parent_project_id', '=', args.projectId)
      .executeTakeFirst();
    if (child) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Move sub-projects out of the programme before changing it to a project'
      );
    }
    return;
  }

  const [budget, category, subCategory, txn] = await Promise.all([
    args.db
      .selectFrom('budget_lines')
      .select('id')
      .where('project_id', '=', args.projectId)
      .executeTakeFirst(),
    args.db
      .selectFrom('categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .executeTakeFirst(),
    args.db
      .selectFrom('sub_categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .executeTakeFirst(),
    args.db
      .selectFrom('txns')
      .select('id')
      .where('project_id', '=', args.projectId)
      .executeTakeFirst(),
  ]);

  if (budget || category || subCategory || txn) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Projects with budgets, taxonomy, or transactions cannot be changed into programmes'
    );
  }
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
      const cRole = await getCompanyRole(
        userId,
        asCompanyId(project.company_id)
      );
      if (cRole !== 'admin' && cRole !== 'executive') {
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

    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
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
    if (typeof args.input.currency !== 'undefined')
      patch.currency = args.input.currency;
    if (typeof args.input.visibility !== 'undefined')
      patch.visibility = args.input.visibility;
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

      return nextProject;
    });

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
      action: 'project:lifecycle',
      companyId: asCompanyId(project.company_id),
      projectId: args.projectId,
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

    await db.deleteFrom('projects').where('id', '=', args.projectId).execute();
  });
}
