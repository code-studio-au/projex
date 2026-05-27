import assert from 'node:assert/strict';
import test from 'node:test';

import { Kysely, PostgresDialect } from 'kysely';
import type { PostgresDialectConfig } from 'kysely';

import { AppError } from '../src/api/errors.ts';
import { isAuthorized } from '../src/server/auth/authorize.ts';
import { createPgPool } from '../src/server/db/pgPool.ts';
import type { DB } from '../src/server/db/schema.ts';
import {
  createBudgetServer,
  deleteBudgetServer,
} from '../src/server/fns/budgets.ts';
import {
  deleteCompanyMembershipServer,
  upsertProjectMembershipServer,
  listAllCompanyMembershipsServer,
} from '../src/server/fns/memberships.ts';
import {
  listUsersServer,
} from '../src/server/fns/companies.ts';
import {
  getProjectServer,
  listProjectsServer,
} from '../src/server/fns/projects.ts';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireOperationalProjectForAction,
  requireProjectForAction,
  requireCompanyMember,
} from '../src/server/fns/resourceGuards.ts';
import {
  createTransactionCommentServer,
} from '../src/server/fns/transactionComments.ts';
import { updateTxnServer } from '../src/server/fns/transactions.ts';
import {
  asCategoryId,
  asBudgetLineId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';

const integrationDatabaseUrl =
  process.env.PROJEX_INTEGRATION_DATABASE_URL?.trim() ?? '';

function assertTestDatabaseUrl(connectionString: string) {
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run DB integration tests against non-test database "${databaseName}". Use a database name containing "test".`
    );
  }
}

function createIntegrationDb() {
  assertTestDatabaseUrl(integrationDatabaseUrl);
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: createPgPool(
        integrationDatabaseUrl
      ) as unknown as PostgresDialectConfig['pool'],
    }),
  });
}

async function assertAppError(
  run: () => Promise<unknown>,
  code: AppError['code'],
  message: string
) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  });
}

test(
  'resource ownership guards enforce persisted parent scope',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_co_1');
    const otherCompanyId = asCompanyId('itest_co_2');
    const userId = asUserId('itest_usr_1');
    const projectId = asProjectId('itest_prj_1');
    const otherProjectId = asProjectId('itest_prj_2');
    const categoryId = asCategoryId('itest_cat_1');
    const subCategoryId = asSubCategoryId('itest_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId('itest_ccat_1');
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId('itest_csub_1');
    const mappingRuleId = asCompanyDefaultMappingRuleId('itest_rule_1');

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Integration Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: otherCompanyId,
            name: 'Other Integration Company',
            status: 'active',
            deactivated_at: null,
          },
        ])
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'integration@example.com',
          name: 'Integration User',
          disabled: false,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Integration Project',
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
            id: otherProjectId,
            company_id: otherCompanyId,
            name: 'Other Integration Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'member' })
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: categoryId,
          company_id: companyId,
          project_id: projectId,
          name: 'Travel',
        })
        .execute();
      await db
        .insertInto('sub_categories')
        .values({
          id: subCategoryId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryId,
          name: 'Flights',
        })
        .execute();
      await db
        .insertInto('company_default_categories')
        .values({
          id: defaultCategoryId,
          company_id: companyId,
          name: 'Travel',
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Flights',
        })
        .execute();
      await db
        .insertInto('company_default_mapping_rules')
        .values({
          id: mappingRuleId,
          company_id: companyId,
          match_text: 'flight',
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: defaultSubCategoryId,
          sort_order: 0,
        })
        .execute();

      await requireCompanyMember({ db, companyId, userId });
      await assertCategoryInProject({ db, projectId, categoryId });
      await assertSubCategoryInProject({
        db,
        projectId,
        categoryId,
        subCategoryId,
      });
      await assertCompanyDefaultMappingRuleInCompany({
        db,
        companyId,
        ruleId: mappingRuleId,
      });

      await assertAppError(
        () => requireCompanyMember({ db, companyId: otherCompanyId, userId }),
        'VALIDATION_ERROR',
        'User must be a company member before being added to a project'
      );
      await assertAppError(
        () =>
          assertCategoryInProject({
            db,
            projectId: otherProjectId,
            categoryId,
          }),
        'NOT_FOUND',
        'Unknown category'
      );
      await assertAppError(
        () =>
          assertCompanyDefaultMappingRuleInCompany({
            db,
            companyId: otherCompanyId,
            ruleId: mappingRuleId,
          }),
        'NOT_FOUND',
        'Unknown company default mapping rule'
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

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
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', superadminId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Superadmin Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: superadminId,
          email: 'superadmin@example.com',
          name: 'Super Admin',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: true,
        })
        .execute();
      await db
        .insertInto('projects')
        .values([
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
        ])
        .execute();

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
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', superadminId).execute();
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
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId, outsiderUserId])
        .execute();

      await db
        .insertInto('companies')
        .values([
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
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
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
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
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
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
        ])
        .execute();
      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: memberUserId, role: 'member' },
          { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
          { project_id: programmeId, user_id: memberUserId, role: 'member' },
        ])
        .execute();

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
        'VALIDATION_ERROR',
        'Programmes are reporting-only and cannot be used for project operations'
      );
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, viewerUserId, outsiderUserId])
        .execute();
      await db.destroy();
    }
  }
);

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
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values([
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
        ])
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'status-user@example.com',
          name: 'Status User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: userId, role: 'member' },
          { company_id: deactivatedCompanyId, user_id: userId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
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
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: activeProjectId, user_id: userId, role: 'member' },
          { project_id: archivedProjectId, user_id: userId, role: 'member' },
          { project_id: hiddenProjectId, user_id: userId, role: 'member' },
        ])
        .execute();

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
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, deactivatedCompanyId])
        .execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
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
    const deactivatedCompanyProjectId = asProjectId('itest_mutation_prj_hidden');
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
          { project_id: activeProjectId, user_id: memberUserId, role: 'member' },
          { project_id: activeProjectId, user_id: viewerUserId, role: 'viewer' },
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
