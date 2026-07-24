import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asImportBatchId,
  asImportRuleId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  assertAppError,
  assertAppErrorCode,
  createIntegrationDb,
  createRouteApi,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'route-backed company/project/transaction actions enforce tenant and role authorization',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_routeauthz_co_1');
    const otherCompanyId = asCompanyId('itest_routeauthz_co_2');
    const adminUserId = asUserId('itest_routeauthz_usr_admin');
    const managementUserId = asUserId('itest_routeauthz_usr_mgmt');
    const memberUserId = asUserId('itest_routeauthz_usr_member');
    const viewerUserId = asUserId('itest_routeauthz_usr_viewer');
    const outsiderUserId = asUserId('itest_routeauthz_usr_outsider');
    const inviteUserId = asUserId('itest_routeauthz_usr_invite');
    const projectId = asProjectId('itest_routeauthz_prj_1');
    const secondProjectId = asProjectId('itest_routeauthz_prj_2');
    const otherProjectId = asProjectId('itest_routeauthz_prj_3');
    const archivedProjectId = asProjectId('itest_routeauthz_prj_4');
    const categoryId = asCategoryId('itest_routeauthz_cat_1');
    const subCategoryId = asSubCategoryId('itest_routeauthz_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_routeauthz_ccat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_routeauthz_csub_1'
    );
    const defaultMappingRuleId = asCompanyDefaultMappingRuleId(
      'itest_routeauthz_map_1'
    );
    const importRuleId = asImportRuleId('itest_routeauthz_rule_1');
    const budgetId = asBudgetLineId('itest_routeauthz_budget_1');
    const txnId = asTxnId('itest_routeauthz_txn_1');
    const commentId = asTxnCommentId('itest_routeauthz_comment_1');
    const importBatchId = asImportBatchId('itest_routeauthz_batch_1');
    const now = new Date().toISOString();

    try {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [
          adminUserId,
          managementUserId,
          memberUserId,
          viewerUserId,
          outsiderUserId,
          inviteUserId,
        ])
        .execute();

      await db
        .insertInto('companies')
        .values([
          {
            id: companyId,
            name: 'Route AuthZ Company',
            status: 'active',
            deactivated_at: null,
          },
          {
            id: otherCompanyId,
            name: 'Route AuthZ Other Company',
            status: 'active',
            deactivated_at: null,
          },
        ])
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: adminUserId,
            email: 'route-authz-admin@example.com',
            name: 'Route AuthZ Admin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: managementUserId,
            email: 'route-authz-mgmt@example.com',
            name: 'Route AuthZ Management',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: memberUserId,
            email: 'route-authz-member@example.com',
            name: 'Route AuthZ Member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: viewerUserId,
            email: 'route-authz-viewer@example.com',
            name: 'Route AuthZ Viewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: outsiderUserId,
            email: 'route-authz-outsider@example.com',
            name: 'Route AuthZ Outsider',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: inviteUserId,
            email: 'route-authz-invite@example.com',
            name: 'Route AuthZ Invite',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: adminUserId, role: 'admin' },
          {
            company_id: companyId,
            user_id: managementUserId,
            role: 'management',
          },
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: viewerUserId, role: 'member' },
          {
            company_id: otherCompanyId,
            user_id: outsiderUserId,
            role: 'admin',
          },
          { company_id: companyId, user_id: inviteUserId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Route AuthZ Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 7_500,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: secondProjectId,
            company_id: companyId,
            name: 'Route AuthZ Destination Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 2_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: otherProjectId,
            company_id: otherCompanyId,
            name: 'Route AuthZ Other Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 1_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: true,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Route AuthZ Archived Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: now,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: adminUserId, role: 'owner' },
          { project_id: projectId, user_id: memberUserId, role: 'member' },
          { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
          { project_id: projectId, user_id: inviteUserId, role: 'member' },
          { project_id: secondProjectId, user_id: adminUserId, role: 'owner' },
          {
            project_id: otherProjectId,
            user_id: outsiderUserId,
            role: 'owner',
          },
          {
            project_id: archivedProjectId,
            user_id: memberUserId,
            role: 'member',
          },
        ])
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
          name: 'Default Travel',
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Default Flights',
        })
        .execute();
      await db
        .insertInto('company_default_mapping_rules')
        .values({
          id: defaultMappingRuleId,
          company_id: companyId,
          match_text: 'flight',
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: defaultSubCategoryId,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_rules')
        .values({
          id: importRuleId,
          company_id: companyId,
          project_id: null,
          name: 'Route AuthZ Import Rule',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'ignore-me',
          sort_order: 99,
          enabled: true,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('budget_lines')
        .values({
          id: budgetId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryId,
          sub_category_id: subCategoryId,
          allocated_cents: 4_000,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'route-authz-ext-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-05-01',
          item: 'Route AuthZ Item',
          description: 'Route AuthZ Description',
          amount_cents: 1_100,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: categoryId,
          sub_category_id: subCategoryId,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txn_comments')
        .values({
          id: commentId,
          company_id: companyId,
          project_id: projectId,
          txn_public_id: txnId,
          parent_comment_id: null,
          body: 'Existing route authz comment',
          assigned_to_user_id: memberUserId,
          created_by_user_id: adminUserId,
          resolved_at: null,
          resolved_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_batches')
        .values({
          id: importBatchId,
          company_id: companyId,
          project_id: projectId,
          source_type: 'powerbi_expenditure_actuals',
          file_name: 'route-authz.csv',
          status: 'previewed',
          created_by_user_id: adminUserId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      const managementApi = createRouteApi(managementUserId);
      const memberApi = createRouteApi(memberUserId);
      const viewerApi = createRouteApi(viewerUserId);
      const outsiderApi = createRouteApi(outsiderUserId);

      assert.equal(await outsiderApi.getCompany(companyId), null);
      assert.deepEqual(await outsiderApi.listProjects(companyId), []);
      await assertAppErrorCode(
        () => outsiderApi.getProject(projectId),
        'FORBIDDEN',
        'GET /api/projects/:projectId outsider'
      );
      await assertAppErrorCode(
        () => outsiderApi.listCompanyMemberships(companyId),
        'FORBIDDEN',
        'GET /api/companies/:companyId/memberships outsider'
      );
      await assertAppErrorCode(
        () => managementApi.getCompanySummary(companyId),
        'FORBIDDEN',
        'GET /api/companies/:companyId/summary management'
      );
      await assertAppErrorCode(
        () => managementApi.getCompanyWorkQueue(companyId),
        'FORBIDDEN',
        'GET /api/companies/:companyId/work-queue management'
      );
      await assertAppErrorCode(
        () => managementApi.createProject(companyId, { name: 'Nope' }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/projects management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.createCompanyDefaultCategory(companyId, {
            companyId,
            name: 'Nope',
          }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/default-categories management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.updateCompanyDefaultSubCategory(companyId, {
            id: defaultSubCategoryId,
            name: 'Blocked',
          }),
        'FORBIDDEN',
        'PATCH /api/companies/:companyId/default-sub-categories/:subCategoryId management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.deleteCompanyDefaultMappingRule(
            companyId,
            defaultMappingRuleId
          ),
        'FORBIDDEN',
        'DELETE /api/companies/:companyId/default-mapping-rules/:ruleId management'
      );
      await assertAppErrorCode(
        () =>
          managementApi.createImportRule(companyId, {
            companyId,
            scope: 'company',
            name: 'Blocked',
            action: 'exclude',
            field: 'journalLineDescription',
            operator: 'contains',
            value: 'blocked',
            sortOrder: 1,
            enabled: true,
          }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/import-rules management'
      );
      await assertAppErrorCode(
        () =>
          memberApi.upsertCompanyMembership(companyId, inviteUserId, 'member'),
        'FORBIDDEN',
        'POST /api/companies/:companyId/memberships member'
      );
      await assertAppErrorCode(
        () => memberApi.deleteCompanyMembership(companyId, inviteUserId),
        'FORBIDDEN',
        'DELETE /api/companies/:companyId/memberships member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.createUserInCompany(companyId, {
            name: 'Blocked Invite',
            email: 'blocked-invite@example.com',
            role: 'member',
          }),
        'FORBIDDEN',
        'POST /api/companies/:companyId/users member'
      );
      await assertAppErrorCode(
        () => memberApi.sendCompanyUserInviteEmail(companyId, inviteUserId),
        'FORBIDDEN',
        'POST /api/companies/:companyId/users/:userId/invite member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.upsertProjectMembership(projectId, inviteUserId, 'member'),
        'FORBIDDEN',
        'POST /api/projects/:projectId/memberships member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.deleteProjectMembership(projectId, inviteUserId, 'member'),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/memberships member'
      );
      await assertAppErrorCode(
        () => memberApi.applyCompanyStandards(projectId),
        'FORBIDDEN',
        'POST /api/projects/:projectId/apply-company-standards member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.createCategory(projectId, {
            companyId,
            projectId,
            name: 'Blocked Category',
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/categories member'
      );
      await assertAppErrorCode(
        () => memberApi.deleteSubCategory(projectId, subCategoryId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/sub-categories/:subCategoryId member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.updateProject({ id: projectId, allowTxnTransfers: false }),
        'FORBIDDEN',
        'PATCH /api/projects/:projectId configure member'
      );
      await assertAppErrorCode(
        () => memberApi.deactivateProject(projectId),
        'FORBIDDEN',
        'POST /api/projects/:projectId/deactivate member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.previewImportTransactions(projectId, {
            csvText: [
              'Date,Item,Description,Amount',
              '2026-05-01,Item,Description,12.34',
            ].join('\n'),
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/import-preview member'
      );
      await assertAppErrorCode(
        () =>
          memberApi.importTransactions(projectId, {
            mode: 'append',
            importBatchId,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/import member'
      );
      await assertAppErrorCode(
        () => memberApi.cancelImportPreview(projectId, importBatchId),
        'FORBIDDEN',
        'POST /api/projects/:projectId/import-batches/:batchId/cancel member'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.createBudget(projectId, {
            companyId,
            projectId,
            categoryId,
            subCategoryId,
            allocatedCents: 2_000,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/budgets viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.deleteBudget(projectId, budgetId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/budgets/:budgetId viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.createTxn(projectId, {
            companyId,
            projectId,
            date: '2026-05-02',
            item: 'Blocked Txn',
            description: 'Blocked Txn',
            amountCents: 550,
            externalId: 'blocked-txn-ext',
            categoryId,
            subCategoryId,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.updateTxn(projectId, { id: txnId, item: 'Blocked' }),
        'FORBIDDEN',
        'PATCH /api/projects/:projectId/transactions viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.deleteTxn(projectId, txnId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/transactions/:txnId viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.splitTxn(projectId, {
            txnId,
            children: [{ amountCents: 500 }, { amountCents: 600 }],
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/split viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.transferTxn(projectId, {
            txnId,
            destinationProjectId: secondProjectId,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/transfer viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.updateTxnWorkflowState(projectId, {
            txnId,
            expectedWorkflowVersion: 0,
            reviewed: true,
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/workflow viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.createTransactionComment(projectId, {
            txnId,
            body: 'Blocked comment',
          }),
        'FORBIDDEN',
        'POST /api/projects/:projectId/transactions/:txnId/comments viewer'
      );
      await assertAppErrorCode(
        () =>
          viewerApi.updateTransactionComment(projectId, txnId, {
            id: commentId,
            body: 'Blocked edit',
          }),
        'FORBIDDEN',
        'PATCH /api/projects/:projectId/transactions/:txnId/comments/:commentId viewer'
      );
      await assertAppErrorCode(
        () => viewerApi.deleteTransactionComment(projectId, txnId, commentId),
        'FORBIDDEN',
        'DELETE /api/projects/:projectId/transactions/:txnId/comments/:commentId viewer'
      );
      await assertAppError(
        () => memberApi.getProject(archivedProjectId),
        'FORBIDDEN',
        'Project is deactivated'
      );
      assert.deepEqual(await outsiderApi.listProjects(companyId), []);
      assert.equal(await outsiderApi.getCompany(companyId), null);
    } finally {
      await db
        .deleteFrom('companies')
        .where('id', 'in', [companyId, otherCompanyId])
        .execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [
          adminUserId,
          managementUserId,
          memberUserId,
          viewerUserId,
          outsiderUserId,
          inviteUserId,
        ])
        .execute();
      await db.destroy();
    }
  }
);
