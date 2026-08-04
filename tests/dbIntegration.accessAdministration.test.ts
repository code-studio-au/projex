import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteCompanyMembershipServer,
  deleteProjectMembershipServer,
  upsertProjectMembershipServer,
} from '../src/server/fns/memberships.ts';
import { asCompanyId, asProjectId, asUserId } from '../src/types/index.ts';
import {
  assertAppError,
  createIntegrationDb,
  deleteTestRowsByIds,
  insertTestRows,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'access administration retains a company admin and project owner while allowing reviewed role replacement',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_access_admin_co');
    const projectId = asProjectId('itest_access_admin_prj');
    const adminUserId = asUserId('itest_access_admin_usr_admin');
    const teammateUserId = asUserId('itest_access_admin_usr_teammate');
    const context = { session: { userId: adminUserId } } as const;

    try {
      await deleteTestRowsByIds({
        db,
        companies: [companyId],
        users: [adminUserId, teammateUserId],
      });
      await insertTestRows(db, 'companies', {
        id: companyId,
        name: 'Access Administration Company',
        status: 'active',
        deactivated_at: null,
      });
      await insertTestRows(db, 'users', [
        {
          id: adminUserId,
          email: 'access-admin@example.com',
          name: 'Access Admin',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: teammateUserId,
          email: 'access-teammate@example.com',
          name: 'Access Teammate',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
      ]);
      await insertTestRows(db, 'company_memberships', [
        { company_id: companyId, user_id: adminUserId, role: 'admin' },
        { company_id: companyId, user_id: teammateUserId, role: 'member' },
      ]);
      await insertTestRows(db, 'projects', {
        id: projectId,
        company_id: companyId,
        name: 'Access Administration Project',
        project_type: 'project',
        parent_project_id: null,
        budget_total_cents: 0,
        currency: 'AUD',
        status: 'active',
        deactivated_at: null,
        visibility: 'private',
        allow_superadmin_access: true,
        allow_txn_transfers: false,
      });
      await insertTestRows(db, 'project_memberships', [
        { project_id: projectId, user_id: adminUserId, role: 'owner' },
        { project_id: projectId, user_id: teammateUserId, role: 'member' },
      ]);

      await assertAppError(
        () =>
          upsertProjectMembershipServer({
            context,
            projectId,
            userId: adminUserId,
            role: 'member',
          }),
        'VALIDATION_ERROR',
        'Project must retain at least one owner'
      );
      await assertAppError(
        () =>
          deleteProjectMembershipServer({
            context,
            projectId,
            userId: adminUserId,
            role: 'owner',
          }),
        'VALIDATION_ERROR',
        'Project must retain at least one owner'
      );
      await assertAppError(
        () =>
          deleteCompanyMembershipServer({
            context,
            companyId,
            userId: adminUserId,
          }),
        'VALIDATION_ERROR',
        'You cannot remove your own company membership'
      );

      await upsertProjectMembershipServer({
        context,
        projectId,
        userId: teammateUserId,
        role: 'owner',
      });
      await upsertProjectMembershipServer({
        context,
        projectId,
        userId: adminUserId,
        role: 'member',
      });

      await assertAppError(
        () =>
          deleteCompanyMembershipServer({
            context,
            companyId,
            userId: teammateUserId,
          }),
        'VALIDATION_ERROR',
        'Project must retain at least one owner'
      );

      const retainedTeammateProjectMembership = await db
        .selectFrom('project_memberships')
        .select('role')
        .where('project_id', '=', projectId)
        .where('user_id', '=', teammateUserId)
        .executeTakeFirst();
      const retainedTeammateCompanyMembership = await db
        .selectFrom('company_memberships')
        .select('role')
        .where('company_id', '=', companyId)
        .where('user_id', '=', teammateUserId)
        .executeTakeFirst();
      assert.deepEqual(retainedTeammateProjectMembership, { role: 'owner' });
      assert.deepEqual(retainedTeammateCompanyMembership, { role: 'member' });

      await upsertProjectMembershipServer({
        context,
        projectId,
        userId: adminUserId,
        role: 'owner',
      });
      await deleteCompanyMembershipServer({
        context,
        companyId,
        userId: teammateUserId,
      });

      const memberships = await db
        .selectFrom('project_memberships')
        .select(['user_id', 'role'])
        .where('project_id', '=', projectId)
        .orderBy('user_id')
        .execute();
      assert.deepEqual(memberships, [{ user_id: adminUserId, role: 'owner' }]);

      const teammateCompanyMembership = await db
        .selectFrom('company_memberships')
        .select('user_id')
        .where('company_id', '=', companyId)
        .where('user_id', '=', teammateUserId)
        .executeTakeFirst();
      assert.equal(teammateCompanyMembership, undefined);
    } finally {
      await deleteTestRowsByIds({
        db,
        companies: [companyId],
        users: [adminUserId, teammateUserId],
      });
      await db.destroy();
    }
  }
);
