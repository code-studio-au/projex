import assert from 'node:assert/strict';
import test from 'node:test';

import { isAuthorized } from '../src/server/auth/authorize.ts';
import {
  requireOperationalProjectForAction,
  requireProjectForAction,
} from '../src/server/fns/resourceGuards.ts';
import { asCompanyId, asProjectId, asUserId } from '../src/types/index.ts';
import {
  assertAppError,
  createIntegrationDb,
  deleteTestRowsByIds,
  integrationDatabaseUrl,
  insertTestRows,
} from './dbIntegration.helpers.ts';

test(
  'superadmin authorization respects allow_superadmin_access for project-scoped actions',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_super_co_1');
    const superadminId = asUserId('itest_super_usr_1');
    const allowedProjectId = asProjectId('itest_super_prj_1');
    const blockedProjectId = asProjectId('itest_super_prj_2');

    try {
      await deleteTestRowsByIds({
        db,
        companies: [companyId],
        users: [superadminId],
      });

      await insertTestRows(db, 'companies', {
        id: companyId,
        name: 'Superadmin Company',
        status: 'active',
        deactivated_at: null,
      });
      await insertTestRows(db, 'users', {
        id: superadminId,
        email: 'superadmin@example.com',
        name: 'Super Admin',
        disabled: false,
        disabled_reason: null,
        is_global_superadmin: true,
      });
      await insertTestRows(db, 'projects', [
        {
          id: allowedProjectId,
          company_id: companyId,
          name: 'Allowed Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
        },
        {
          id: blockedProjectId,
          company_id: companyId,
          name: 'Blocked Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: false,
        },
      ]);

      assert.equal(
        await isAuthorized({
          db,
          userId: superadminId,
          action: 'company:view',
          companyId,
        }),
        true
      );
      assert.equal(
        await isAuthorized({
          db,
          userId: superadminId,
          action: 'project:view',
          companyId,
          projectId: allowedProjectId,
        }),
        true
      );
      assert.equal(
        await isAuthorized({
          db,
          userId: superadminId,
          action: 'project:view',
          companyId,
          projectId: blockedProjectId,
        }),
        false
      );
    } finally {
      await deleteTestRowsByIds({
        db,
        companies: [companyId],
        users: [superadminId],
      });
      await db.destroy();
    }
  }
);

test(
  'project resource guards reject cross-project and viewer mutation access',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_guard_co_1');
    const otherCompanyId = asCompanyId('itest_guard_co_2');
    const memberUserId = asUserId('itest_guard_usr_member');
    const viewerUserId = asUserId('itest_guard_usr_viewer');
    const outsiderUserId = asUserId('itest_guard_usr_outsider');
    const projectId = asProjectId('itest_guard_prj_1');
    const programmeId = asProjectId('itest_guard_prog_1');
    const otherProjectId = asProjectId('itest_guard_prj_2');

    try {
      await deleteTestRowsByIds({
        db,
        companies: [companyId, otherCompanyId],
        users: [memberUserId, viewerUserId, outsiderUserId],
      });

      await insertTestRows(db, 'companies', [
        {
          id: companyId,
          name: 'Guard Company',
          status: 'active',
          deactivated_at: null,
        },
        {
          id: otherCompanyId,
          name: 'Other Guard Company',
          status: 'active',
          deactivated_at: null,
        },
      ]);

      await insertTestRows(db, 'users', [
        {
          id: memberUserId,
          email: 'guard-member@example.com',
          name: 'Guard Member',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: viewerUserId,
          email: 'guard-viewer@example.com',
          name: 'Guard Viewer',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: outsiderUserId,
          email: 'guard-outsider@example.com',
          name: 'Guard Outsider',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
      ]);

      await insertTestRows(db, 'projects', [
        {
          id: projectId,
          company_id: companyId,
          name: 'Guard Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
        },
        {
          id: programmeId,
          company_id: companyId,
          name: 'Guard Programme',
          project_type: 'programme',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
        },
        {
          id: otherProjectId,
          company_id: otherCompanyId,
          name: 'Other Guard Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
        },
      ]);

      await insertTestRows(db, 'company_memberships', [
        { company_id: companyId, user_id: memberUserId, role: 'member' },
        { company_id: companyId, user_id: viewerUserId, role: 'member' },
      ]);
      await insertTestRows(db, 'project_memberships', [
        { project_id: projectId, user_id: memberUserId, role: 'member' },
        { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
        { project_id: programmeId, user_id: memberUserId, role: 'member' },
      ]);

      const memberContext = await requireProjectForAction(
        { session: { userId: memberUserId } },
        projectId,
        'project:view',
        db
      );
      assert.equal(memberContext.companyId, companyId);
      assert.equal(memberContext.projectId, projectId);

      await assertAppError(
        () =>
          requireProjectForAction(
            { session: { userId: viewerUserId } },
            projectId,
            'txns:edit',
            db
          ),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          requireProjectForAction(
            { session: { userId: memberUserId } },
            otherProjectId,
            'project:view',
            db
          ),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          requireProjectForAction(
            { session: { userId: outsiderUserId } },
            projectId,
            'project:view',
            db
          ),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          requireOperationalProjectForAction(
            { session: { userId: memberUserId } },
            programmeId,
            'txns:edit',
            db
          ),
        'FORBIDDEN',
        'Programmes are reporting-only and cannot be used for project operations'
      );
    } finally {
      await deleteTestRowsByIds({
        db,
        companies: [companyId, otherCompanyId],
        users: [memberUserId, viewerUserId, outsiderUserId],
      });
      await db.destroy();
    }
  }
);
