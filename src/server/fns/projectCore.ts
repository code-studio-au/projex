import { AppError } from '../../api/errors';
import type {
  CompanyId,
  Project,
  ProjectId,
  ProjectType,
  UserId,
} from '../../types';
import { asCompanyId, asProjectId } from '../../types';
import { getDb } from '../db/db';

export type ProjectRow = {
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

export const projectSelectFields = [
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

export function toProject(row: ProjectRow): Project {
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

export async function assertValidProjectHierarchy(args: {
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

export async function assertProjectTypeTransitionAllowed(args: {
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

export async function getCompanyRole(userId: UserId, companyId: CompanyId) {
  const db = getDb();
  const row = await db
    .selectFrom('company_memberships')
    .select('role')
    .where('user_id', '=', userId)
    .where('company_id', '=', companyId)
    .executeTakeFirst();
  return row?.role ?? null;
}
