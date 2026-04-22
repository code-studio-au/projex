import type { Kysely } from 'kysely';

import type { CompanyId, ProjectId, UserId } from '../../types';
import { AppError } from '../../api/errors';
import type { DB } from '../db/schema';
import { can, type Action } from '../../utils/auth';

type MembershipSnapshot = {
  companyMemberships: Array<{ companyId: CompanyId; userId: UserId; role: 'superadmin' | 'admin' | 'executive' | 'management' | 'member' }>;
  projectMemberships: Array<{ projectId: ProjectId; userId: UserId; role: 'owner' | 'lead' | 'member' | 'viewer' }>;
};

async function loadMembershipSnapshot(params: {
  db: Kysely<DB>;
  userId: UserId;
  companyId: CompanyId;
  projectId?: ProjectId;
}): Promise<MembershipSnapshot> {
  const { db, userId, companyId, projectId } = params;

  const [companyRows, projectRows, superadminRow] = await Promise.all([
    db
      .selectFrom('company_memberships')
      .select(['company_id', 'user_id', 'role'])
      .where('user_id', '=', userId)
      .where('company_id', '=', companyId)
      .execute(),
    projectId
      ? db
          .selectFrom('project_memberships')
          .select(['project_id', 'user_id', 'role'])
          .where('user_id', '=', userId)
          .where('project_id', '=', projectId)
          .execute()
      : Promise.resolve([]),
    db
      .selectFrom('company_memberships')
      .select('company_id')
      .where('user_id', '=', userId)
      .where('role', '=', 'superadmin')
      .limit(1)
      .executeTakeFirst(),
  ]);

  const companyMemberships = companyRows.map((r) => ({
    companyId: r.company_id as CompanyId,
    userId: r.user_id as UserId,
    role: r.role,
  }));

  if (superadminRow && !companyMemberships.some((m) => m.role === 'superadmin')) {
    companyMemberships.push({
      companyId,
      userId,
      role: 'superadmin',
    });
  }

  return {
    companyMemberships,
    projectMemberships: projectRows.map((r) => ({
      projectId: r.project_id as ProjectId,
      userId: r.user_id as UserId,
      role: r.role,
    })),
  };
}

async function projectAllowsSuperadminAccess(
  db: Kysely<DB>,
  projectId: ProjectId
): Promise<boolean> {
  const row = await db
    .selectFrom('projects')
    .select('allow_superadmin_access')
    .where('id', '=', projectId)
    .executeTakeFirst();
  return row?.allow_superadmin_access ?? true;
}

export async function isAuthorized(params: {
  db: Kysely<DB>;
  userId: UserId;
  action: Action;
  companyId: CompanyId;
  projectId?: ProjectId;
}): Promise<boolean> {
  const { db, userId, action, companyId, projectId } = params;
  const snap = await loadMembershipSnapshot({ db, userId, companyId, projectId });
  const isSuperadmin = snap.companyMemberships.some(
    (m) => m.userId === userId && m.role === 'superadmin'
  );

  if (isSuperadmin && projectId) {
    const allowed = await projectAllowsSuperadminAccess(db, projectId);
    if (!allowed) return false;
  }

  return can({
    userId,
    action,
    companyId,
    projectId,
    companyMemberships: snap.companyMemberships,
    projectMemberships: snap.projectMemberships,
  });
}

export async function requireAuthorized(params: {
  db: Kysely<DB>;
  userId: UserId;
  action: Action;
  companyId: CompanyId;
  projectId?: ProjectId;
}): Promise<void> {
  const { db, userId, action, companyId, projectId } = params;
  const ok = await isAuthorized({ db, userId, action, companyId, projectId });
  if (!ok) throw new AppError('FORBIDDEN', 'Forbidden');
}
