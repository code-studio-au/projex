import assert from 'node:assert/strict';
import test from 'node:test';

import { listUsersServer } from '../src/server/fns/companies.ts';
import {
  createBudgetServer,
  deleteBudgetServer,
} from '../src/server/fns/budgets.ts';
import {
  getProjectServer,
  listProjectsServer,
} from '../src/server/fns/projects.ts';
import { updateTxnServer } from '../src/server/fns/transactions.ts';
import { createTransactionCommentServer } from '../src/server/fns/transactionComments.ts';
import {
  deleteCompanyMembershipServer,
  listAllCompanyMembershipsServer,
  upsertProjectMembershipServer,
} from '../src/server/fns/memberships.ts';
import {
  asBudgetLineId,
  asCompanyId,
  asProjectId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  assertAppError,
  createIntegrationDb,
  deleteTestRowsByIds,
  integrationDatabaseUrl,
  insertTestRows,
} from './dbIntegration.helpers.ts';

test(
  'project listing and detail access respect deactivated companies and archived projects',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_status_co_1');
    const userId = asUserId('itest_status_usr_1');
    const activeProjectId = asProjectId('itest_status_prj_active');
    const archivedProjectId = asProjectId('itest_status_prj_archived');
    const deactivatedCompanyId = asCompanyId('itest_status_co_2');
    const hiddenProjectId = asProjectId('itest_status_prj_hidden');

    try {
      await deleteTestRowsByIds({
        db,
        companies: [companyId, deactivatedCompanyId],
        users: [userId],
      });

      await insertTestRows(db, 'companies', [
        {
          id: companyId,
          name: 'Status Company',
          status: 'active',
          deactivated_at: null,
        },
        {
          id: deactivatedCompanyId,
          name: 'Deactivated Company',
          status: 'deactivated',
          deactivated_at: new Date().toISOString(),
        },
      ]);

      await insertTestRows(db, 'users', {
        id: userId,
        email: 'status-user@example.com',
        name: 'Status User',
        disabled: false,
        disabled_reason: null,
        is_global_superadmin: false,
      });

      await insertTestRows(db, 'company_memberships', [
        { company_id: companyId, user_id: userId, role: 'member' },
        { company_id: deactivatedCompanyId, user_id: userId, role: 'member' },
      ]);

      await insertTestRows(db, 'projects', [
        {
          id: activeProjectId,
          company_id: companyId,
          name: 'Active Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          allow_txn_transfers: false,
        },
        {
          id: archivedProjectId,
          company_id: companyId,
          name: 'Archived Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'archived',
          deactivated_at: new Date().toISOString(),
          visibility: 'private',
          allow_superadmin_access: true,
          allow_txn_transfers: false,
        },
        {
          id: hiddenProjectId,
          company_id: deactivatedCompanyId,
          name: 'Hidden Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          allow_txn_transfers: false,
        },
      ]);

      await insertTestRows(db, 'project_memberships', [
        { project_id: activeProjectId, user_id: userId, role: 'member' },
        { project_id: archivedProjectId, user_id: userId, role: 'member' },
        { project_id: hiddenProjectId, user_id: userId, role: 'member' },
      ]);

      const listed = await listProjectsServer({
        context: { session: { userId } },
        companyId,
      });
      assert.deepEqual(
        listed.map((project) => project.id),
        [activeProjectId]
      );

      const deactivatedListed = await listProjectsServer({
        context: { session: { userId } },
        companyId: deactivatedCompanyId,
      });
      assert.deepEqual(deactivatedListed, []);

      const activeProject = await getProjectServer({
        context: { session: { userId } },
        projectId: activeProjectId,
      });
      assert.equal(activeProject?.id, activeProjectId);

      await assertAppError(
        () =>
          getProjectServer({
            context: { session: { userId } },
            projectId: archivedProjectId,
          }),
        'FORBIDDEN',
        'Project is deactivated'
      );

      const hiddenProject = await getProjectServer({
        context: { session: { userId } },
        projectId: hiddenProjectId,
      });
      assert.equal(hiddenProject, null);
    } finally {
      await deleteTestRowsByIds({
        db,
        companies: [companyId, deactivatedCompanyId],
        users: [userId],
      });
      await db.destroy();
    }
  }
);

test(
  'real mutation server functions reject unauthorized roles and deactivated resources',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_mutation_co_1');
    const deactivatedCompanyId = asCompanyId('itest_mutation_co_2');
    const memberUserId = asUserId('itest_mutation_usr_member');
    const viewerUserId = asUserId('itest_mutation_usr_viewer');
    const activeProjectId = asProjectId('itest_mutation_prj_active');
    const archivedProjectId = asProjectId('itest_mutation_prj_archived');
    const deactivatedCompanyProjectId = asProjectId(
      'itest_mutation_prj_hidden'
    );
    const budgetId = asBudgetLineId('itest_mutation_budget_1');
    const txnId = asTxnId('itest_mutation_txn_1');
    const commentId = asTxnCommentId('itest_mutation_comment_1');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Mutation Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: deactivatedCompanyId,
            name: 'Deactivated Mutation Company',
            status: 'deactivated',
            deactivated_at: new Date().toISOString(),
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: memberUserId,
            email: 'mutation-member@example.com',
            name: 'Mutation Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: viewerUserId,
            email: 'mutation-viewer@example.com',
            name: 'Mutation Viewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
          {
            company_id: deactivatedCompanyId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: activeProjectId,
            company_id: companyId,
            name: 'Active Mutation Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Archived Mutation Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: new Date().toISOString(),
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
          {
            id: deactivatedCompanyProjectId,
            company_id: deactivatedCompanyId,
            name: 'Company Down Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          {
            project_id: activeProjectId,
            user_id: memberUserId,
            role: 'member',
          },
          {
            project_id: activeProjectId,
            user_id: viewerUserId,
            role: 'viewer',
          },
          {
            project_id: archivedProjectId,
            user_id: memberUserId,
            role: 'member',
          },
          {
            project_id: deactivatedCompanyProjectId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
        .execute();

      await db
        .insertInto('budget_lines')
        .values({
          id: budgetId,
          company_id: companyId,
          project_id: activeProjectId,
          category_id: null,
          sub_category_id: null,
          allocated_cents: 5_000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'mutation-ext-1',
          company_id: companyId,
          project_id: activeProjectId,
          txn_date: '2026-05-01',
          item: 'Mutation Item',
          description: 'Mutation Description',
          amount_cents: 1200,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto('txn_comments')
        .values({
          id: commentId,
          company_id: companyId,
          project_id: activeProjectId,
          txn_public_id: txnId,
          parent_comment_id: null,
          body: 'Existing comment',
          assigned_to_user_id: null,
          created_by_user_id: memberUserId,
          resolved_at: null,
          resolved_by_user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      await assertAppError(
        () =>
          updateTxnServer({
            context: { session: { userId: viewerUserId } },
            projectId: activeProjectId,
            input: { id: txnId, item: 'Changed by viewer' },
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          deleteBudgetServer({
            context: { session: { userId: viewerUserId } },
            projectId: activeProjectId,
            budgetId,
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          createTransactionCommentServer({
            context: { session: { userId: viewerUserId } },
            projectId: activeProjectId,
            input: {
              txnId,
              body: 'Viewer comment should be blocked',
            },
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          upsertProjectMembershipServer({
            context: { session: { userId: memberUserId } },
            projectId: activeProjectId,
            userId: viewerUserId,
            role: 'member',
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          deleteCompanyMembershipServer({
            context: { session: { userId: memberUserId } },
            companyId,
            userId: viewerUserId,
          }),
        'FORBIDDEN',
        'Forbidden'
      );

      await assertAppError(
        () =>
          createBudgetServer({
            context: { session: { userId: memberUserId } },
            projectId: archivedProjectId,
            input: {
              companyId,
              projectId: archivedProjectId,
              allocatedCents: 100,
            },
          }),
        'FORBIDDEN',
        'Project is deactivated'
      );

      await assertAppError(
        () =>
          createBudgetServer({
            context: { session: { userId: memberUserId } },
            projectId: deactivatedCompanyProjectId,
            input: {
              companyId: deactivatedCompanyId,
              projectId: deactivatedCompanyProjectId,
              allocatedCents: 100,
            },
          }),
        'FORBIDDEN',
        'Company is deactivated'
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'non-superadmin user listings stay scoped to active shared companies and omit admin-only flags',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_userscope_co_1');
    const deactivatedCompanyId = asCompanyId('itest_userscope_co_2');
    const callerUserId = asUserId('itest_userscope_usr_caller');
    const sharedUserId = asUserId('itest_userscope_usr_shared');
    const deactivatedUserId = asUserId('itest_userscope_usr_old');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [callerUserId, sharedUserId, deactivatedUserId])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'User Scope Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: deactivatedCompanyId,
            name: 'User Scope Old Company',
            status: 'deactivated',
            deactivated_at: new Date().toISOString(),
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: callerUserId,
            email: 'caller@example.com',
            name: 'Caller User',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: sharedUserId,
            email: 'shared@example.com',
            name: 'Shared User',
            disabled: true,
            disabled_reason: 'company_deactivated',
            is_global_superadmin: true,
          },
          {
            id: deactivatedUserId,
            email: 'old@example.com',
            name: 'Old User',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: callerUserId, role: 'member' },
          { company_id: companyId, user_id: sharedUserId, role: 'member' },
          {
            company_id: deactivatedCompanyId,
            user_id: callerUserId,
            role: 'member',
          },
          {
            company_id: deactivatedCompanyId,
            user_id: deactivatedUserId,
            role: 'member',
          },
        ])
        .execute();

      const users = await listUsersServer({
        context: { session: { userId: callerUserId } },
      });
      assert.deepEqual(
        users.map((user) => user.id).sort(),
        [callerUserId, sharedUserId].sort()
      );
      assert.equal(
        users.some((user) => user.id === deactivatedUserId),
        false
      );
      const sharedUser = users.find((user) => user.id === sharedUserId);
      assert.equal(sharedUser?.disabled, undefined);
      assert.equal(sharedUser?.isGlobalSuperadmin, undefined);

      const memberships = await listAllCompanyMembershipsServer({
        context: { session: { userId: callerUserId } },
      });
      assert.equal(
        memberships.some(
          (membership) => membership.companyId === deactivatedCompanyId
        ),
        false
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [callerUserId, sharedUserId, deactivatedUserId])
        .execute();
      await db.destroy();
    }
  }
);
