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
  assertAppErrorCode,
  createIntegrationDb,
  createRouteApi,
  deleteTestRowsByIds,
  integrationDatabaseUrl,
  insertTestRows,
  type RouteApi,
} from './dbIntegration.helpers.ts';

test(
  'protected company/project/transaction route surface rejects unauthenticated access',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_routeauth_co_1');
    const otherCompanyId = asCompanyId('itest_routeauth_co_2');
    const adminUserId = asUserId('itest_routeauth_usr_admin');
    const execUserId = asUserId('itest_routeauth_usr_exec');
    const managementUserId = asUserId('itest_routeauth_usr_mgmt');
    const memberUserId = asUserId('itest_routeauth_usr_member');
    const viewerUserId = asUserId('itest_routeauth_usr_viewer');
    const outsiderUserId = asUserId('itest_routeauth_usr_outsider');
    const inviteUserId = asUserId('itest_routeauth_usr_invite');
    const projectId = asProjectId('itest_routeauth_prj_1');
    const secondProjectId = asProjectId('itest_routeauth_prj_2');
    const otherProjectId = asProjectId('itest_routeauth_prj_3');
    const archivedProjectId = asProjectId('itest_routeauth_prj_4');
    const categoryId = asCategoryId('itest_routeauth_cat_1');
    const subCategoryId = asSubCategoryId('itest_routeauth_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_routeauth_ccat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_routeauth_csub_1'
    );
    const defaultMappingRuleId = asCompanyDefaultMappingRuleId(
      'itest_routeauth_map_1'
    );
    const importRuleId = asImportRuleId('itest_routeauth_rule_1');
    const budgetId = asBudgetLineId('itest_routeauth_budget_1');
    const txnId = asTxnId('itest_routeauth_txn_1');
    const commentId = asTxnCommentId('itest_routeauth_comment_1');
    const importBatchId = asImportBatchId('itest_routeauth_batch_1');
    const now = new Date().toISOString();
    const seededCompanyIds = [companyId, otherCompanyId] as const;
    const seededUserIds = [
      adminUserId,
      execUserId,
      managementUserId,
      memberUserId,
      viewerUserId,
      outsiderUserId,
      inviteUserId,
    ] as const;

    try {
      await deleteTestRowsByIds({
        db,
        companies: seededCompanyIds,
        users: seededUserIds,
      });

      await insertTestRows(db, 'companies', [
        {
          id: companyId,
          name: 'Route Auth Company',
          status: 'active',
          deactivated_at: null,
        },
        {
          id: otherCompanyId,
          name: 'Route Auth Other Company',
          status: 'active',
          deactivated_at: null,
        },
      ]);

      await insertTestRows(db, 'users', [
        {
          id: adminUserId,
          email: 'route-admin@example.com',
          name: 'Route Admin',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: execUserId,
          email: 'route-exec@example.com',
          name: 'Route Exec',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: managementUserId,
          email: 'route-mgmt@example.com',
          name: 'Route Management',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: memberUserId,
          email: 'route-member@example.com',
          name: 'Route Member',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: viewerUserId,
          email: 'route-viewer@example.com',
          name: 'Route Viewer',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: outsiderUserId,
          email: 'route-outsider@example.com',
          name: 'Route Outsider',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
        {
          id: inviteUserId,
          email: 'route-invite@example.com',
          name: 'Route Invite',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        },
      ]);

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: adminUserId, role: 'admin' },
          { company_id: companyId, user_id: execUserId, role: 'executive' },
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
            name: 'Route Auth Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 10_000,
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
            name: 'Route Auth Destination Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 5_000,
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
            name: 'Route Auth Other Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 3_000,
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
            name: 'Route Auth Archived Project',
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
          { project_id: projectId, user_id: execUserId, role: 'lead' },
          { project_id: projectId, user_id: memberUserId, role: 'member' },
          { project_id: projectId, user_id: viewerUserId, role: 'viewer' },
          { project_id: projectId, user_id: inviteUserId, role: 'member' },
          { project_id: secondProjectId, user_id: adminUserId, role: 'owner' },
          { project_id: secondProjectId, user_id: execUserId, role: 'lead' },
          {
            project_id: otherProjectId,
            user_id: outsiderUserId,
            role: 'owner',
          },
          {
            project_id: archivedProjectId,
            user_id: adminUserId,
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
          name: 'Route Import Rule',
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
          allocated_cents: 5_000,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'route-auth-ext-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-05-01',
          item: 'Route Auth Item',
          description: 'Route Auth Description',
          amount_cents: 1_250,
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
          body: 'Existing route comment',
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
          file_name: 'route-auth.csv',
          status: 'previewed',
          created_by_user_id: adminUserId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      const api = createRouteApi(null);
      const unauthenticatedOps: Array<{
        route: string;
        run: (api: RouteApi) => Promise<unknown>;
      }> = [
        { route: 'GET /api/users', run: (x) => x.listUsers() },
        { route: 'GET /api/companies', run: (x) => x.listCompanies() },
        {
          route: 'POST /api/companies',
          run: (x) =>
            x.createCompany({
              name: 'Unauthed Company',
              initialAdminName: 'Unauthed Admin',
              initialAdminEmail: 'unauthed-admin@example.com',
            }),
        },
        {
          route: 'GET /api/companies/:companyId',
          run: (x) => x.getCompany(companyId),
        },
        {
          route: 'PATCH /api/companies/:companyId',
          run: (x) => x.updateCompany({ id: companyId, name: 'Renamed' }),
        },
        {
          route: 'DELETE /api/companies/:companyId',
          run: (x) =>
            x.deleteCompany({
              companyId,
              confirmation: 'DELETE Route Auth Company',
            }),
        },
        {
          route: 'POST /api/companies/:companyId/deactivate',
          run: (x) => x.deactivateCompany(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/reactivate',
          run: (x) => x.reactivateCompany(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/summary',
          run: (x) => x.getCompanySummary(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/work-queue',
          run: (x) => x.getCompanyWorkQueue(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/defaults',
          run: (x) => x.getCompanyDefaults(companyId),
        },
        {
          route: 'GET /api/companies/:companyId/projects',
          run: (x) => x.listProjects(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/projects',
          run: (x) => x.createProject(companyId, { name: 'Created Project' }),
        },
        {
          route: 'GET /api/companies/:companyId/memberships',
          run: (x) => x.listCompanyMemberships(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/memberships',
          run: (x) =>
            x.upsertCompanyMembership(companyId, inviteUserId, 'member'),
        },
        {
          route: 'DELETE /api/companies/:companyId/memberships',
          run: (x) => x.deleteCompanyMembership(companyId, inviteUserId),
        },
        {
          route: 'GET /api/companies/:companyId/my-project-memberships',
          run: (x) => x.listMyProjectMemberships(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/users',
          run: (x) =>
            x.createUserInCompany(companyId, {
              name: 'Invite Pending',
              email: 'pending@example.com',
              role: 'member',
            }),
        },
        {
          route: 'POST /api/companies/:companyId/users/:userId/invite',
          run: (x) => x.sendCompanyUserInviteEmail(companyId, inviteUserId),
        },
        {
          route: 'GET /api/companies/:companyId/default-categories',
          run: (x) => x.listCompanyDefaultCategories(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/default-categories',
          run: (x) =>
            x.createCompanyDefaultCategory(companyId, {
              companyId,
              name: 'New Default Category',
            }),
        },
        {
          route:
            'DELETE /api/companies/:companyId/default-categories/:categoryId',
          run: (x) =>
            x.deleteCompanyDefaultCategory(companyId, defaultCategoryId),
        },
        {
          route: 'GET /api/companies/:companyId/default-sub-categories',
          run: (x) => x.listCompanyDefaultSubCategories(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/default-sub-categories',
          run: (x) =>
            x.createCompanyDefaultSubCategory(companyId, {
              companyId,
              companyDefaultCategoryId: defaultCategoryId,
              name: 'New Default SubCategory',
            }),
        },
        {
          route:
            'DELETE /api/companies/:companyId/default-sub-categories/:subCategoryId',
          run: (x) =>
            x.deleteCompanyDefaultSubCategory(companyId, defaultSubCategoryId),
        },
        {
          route: 'GET /api/companies/:companyId/default-mapping-rules',
          run: (x) => x.listCompanyDefaultMappingRules(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/default-mapping-rules',
          run: (x) =>
            x.createCompanyDefaultMappingRule(companyId, {
              companyId,
              matchText: 'hotel',
              companyDefaultSubCategoryId: defaultSubCategoryId,
              sortOrder: 1,
            }),
        },
        {
          route:
            'DELETE /api/companies/:companyId/default-mapping-rules/:ruleId',
          run: (x) =>
            x.deleteCompanyDefaultMappingRule(companyId, defaultMappingRuleId),
        },
        {
          route: 'GET /api/companies/:companyId/import-rules',
          run: (x) => x.listImportRules(companyId),
        },
        {
          route: 'POST /api/companies/:companyId/import-rules',
          run: (x) =>
            x.createImportRule(companyId, {
              companyId,
              scope: 'company',
              name: 'Block Payroll',
              action: 'exclude',
              field: 'journalLineDescription',
              operator: 'contains_any',
              value: 'salary,payroll',
              sortOrder: 3,
              enabled: true,
            }),
        },
        {
          route: 'DELETE /api/companies/:companyId/import-rules/:ruleId',
          run: (x) => x.deleteImportRule(companyId, importRuleId),
        },
        {
          route: 'GET /api/memberships/companies',
          run: (x) => x.listAllCompanyMemberships(),
        },
        {
          route: 'GET /api/projects/:projectId',
          run: (x) => x.getProject(projectId),
        },
        {
          route: 'PATCH /api/projects/:projectId',
          run: (x) =>
            x.updateProject({ id: projectId, name: 'Changed Project' }),
        },
        {
          route: 'DELETE /api/projects/:projectId',
          run: (x) =>
            x.deleteProject({
              projectId,
              confirmation: 'DELETE Route Auth Project',
            }),
        },
        {
          route: 'POST /api/projects/:projectId/deactivate',
          run: (x) => x.deactivateProject(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/reactivate',
          run: (x) => x.reactivateProject(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/memberships',
          run: (x) => x.listProjectMemberships(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/memberships',
          run: (x) =>
            x.upsertProjectMembership(projectId, inviteUserId, 'member'),
        },
        {
          route: 'DELETE /api/projects/:projectId/memberships',
          run: (x) =>
            x.deleteProjectMembership(projectId, inviteUserId, 'member'),
        },
        {
          route: 'POST /api/projects/:projectId/apply-company-standards',
          run: (x) => x.applyCompanyStandards(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/categories',
          run: (x) => x.listCategories(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/categories',
          run: (x) =>
            x.createCategory(projectId, {
              companyId,
              projectId,
              name: 'Meals',
            }),
        },
        {
          route: 'DELETE /api/projects/:projectId/categories/:categoryId',
          run: (x) => x.deleteCategory(projectId, categoryId),
        },
        {
          route: 'GET /api/projects/:projectId/sub-categories',
          run: (x) => x.listSubCategories(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/sub-categories',
          run: (x) =>
            x.createSubCategory(projectId, {
              companyId,
              projectId,
              categoryId,
              name: 'Dinner',
            }),
        },
        {
          route:
            'DELETE /api/projects/:projectId/sub-categories/:subCategoryId',
          run: (x) => x.deleteSubCategory(projectId, subCategoryId),
        },
        {
          route: 'GET /api/projects/:projectId/budgets',
          run: (x) => x.listBudgets(projectId),
        },
        {
          route: 'POST /api/projects/:projectId/budgets',
          run: (x) =>
            x.createBudget(projectId, {
              companyId,
              projectId,
              categoryId,
              subCategoryId,
              allocatedCents: 2_000,
            }),
        },
        {
          route: 'DELETE /api/projects/:projectId/budgets/:budgetId',
          run: (x) => x.deleteBudget(projectId, budgetId),
        },
        {
          route: 'GET /api/projects/:projectId/transactions',
          run: (x) => x.listTransactions(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/transactions?mode=page',
          run: (x) =>
            x.listTransactionsPage(projectId, { pageIndex: 0, pageSize: 20 }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions',
          run: (x) =>
            x.createTxn(projectId, {
              companyId,
              projectId,
              date: '2026-05-02',
              item: 'Created Item',
              description: 'Created Description',
              amountCents: 550,
              externalId: 'created-ext-1',
              categoryId,
              subCategoryId,
            }),
        },
        {
          route: 'PATCH /api/projects/:projectId/transactions',
          run: (x) =>
            x.updateTxn(projectId, { id: txnId, item: 'Changed Item' }),
        },
        {
          route: 'DELETE /api/projects/:projectId/transactions/:txnId',
          run: (x) => x.deleteTxn(projectId, txnId),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/split',
          run: (x) =>
            x.splitTxn(projectId, {
              txnId,
              children: [{ amountCents: 600 }, { amountCents: 650 }],
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/transfer',
          run: (x) =>
            x.transferTxn(projectId, {
              txnId,
              destinationProjectId: secondProjectId,
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/workflow',
          run: (x) =>
            x.updateTxnWorkflowState(projectId, {
              txnId,
              expectedWorkflowVersion: 0,
              reviewed: true,
            }),
        },
        {
          route: 'GET /api/projects/:projectId/transactions/comment-summaries',
          run: (x) => x.listTransactionCommentSummaries(projectId),
        },
        {
          route: 'GET /api/projects/:projectId/transactions/:txnId/comments',
          run: (x) => x.listTransactionComments(projectId, txnId),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/:txnId/comments',
          run: (x) =>
            x.createTransactionComment(projectId, {
              txnId,
              body: 'Please review',
            }),
        },
        {
          route:
            'PATCH /api/projects/:projectId/transactions/:txnId/comments/:commentId',
          run: (x) =>
            x.updateTransactionComment(projectId, txnId, {
              id: commentId,
              body: 'Updated body',
            }),
        },
        {
          route:
            'DELETE /api/projects/:projectId/transactions/:txnId/comments/:commentId',
          run: (x) => x.deleteTransactionComment(projectId, txnId, commentId),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/import-preview',
          run: (x) =>
            x.previewImportTransactions(projectId, {
              csvText: [
                'Date,Item,Description,Amount',
                '2026-05-01,Item,Description,12.34',
              ].join('\n'),
            }),
        },
        {
          route: 'POST /api/projects/:projectId/transactions/import',
          run: (x) =>
            x.importTransactions(projectId, {
              mode: 'append',
              importBatchId,
            }),
        },
        {
          route: 'POST /api/projects/:projectId/import-batches/:batchId/cancel',
          run: (x) => x.cancelImportPreview(projectId, importBatchId),
        },
      ];

      for (const op of unauthenticatedOps) {
        await assertAppErrorCode(
          () => op.run(api),
          'UNAUTHENTICATED',
          op.route
        );
      }
    } finally {
      await deleteTestRowsByIds({
        db,
        companies: seededCompanyIds,
        users: seededUserIds,
      });
      await db.destroy();
    }
  }
);
