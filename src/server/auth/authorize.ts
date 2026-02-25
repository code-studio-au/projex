import type { Kysely } from 'kysely';

import type { CompanyId, ProjectId, UserId } from '../../types';
import { AppError } from '../../api/errors';
import type { DB } from '../db/schema';
import { can, type Action } from '../../utils/auth';

type MembershipSnapshot = {
  companyMemberships: Array<{ companyId: CompanyId; userId: UserId; role: 'superadmin' | 'admin' | 'executive' | 'management' | 'member' }>;
  projectMemberships: Array<{ projectId: ProjectId; userId: UserId; role: 'owner' | 'lead' | 'member' | 'viewer' }>;
};

async function loadMembershipSnapshot(db: Kysely<DB>): Promise<MembershipSnapshot> {
  const [companyRows, projectRows] = await Promise.all([
    db
      .selectFrom('company_memberships')
      .select(['company_id', 'user_id', 'role'])
      .execute(),
    db
      .selectFrom('project_memberships')
      .select(['project_id', 'user_id', 'role'])
      .execute(),
  ]);

  return {
    companyMemberships: companyRows.map((r) => ({
      companyId: r.company_id as CompanyId,
      userId: r.user_id as UserId,
      role: r.role,
    })),
    projectMemberships: projectRows.map((r) => ({
      projectId: r.project_id as ProjectId,
      userId: r.user_id as UserId,
      role: r.role,
    })),
  };
}

export async function requireAuthorized(params: {
  db: Kysely<DB>;
  userId: UserId;
  action: Action;
  companyId: CompanyId;
  projectId?: ProjectId;
}): Promise<void> {
  const { db, userId, action, companyId, projectId } = params;
  const snap = await loadMembershipSnapshot(db);
  const ok = can({
    userId,
    action,
    companyId,
    projectId,
    companyMemberships: snap.companyMemberships,
    projectMemberships: snap.projectMemberships,
  });
  if (!ok) throw new AppError('FORBIDDEN', 'Forbidden');
}
