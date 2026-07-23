import assert from 'node:assert/strict';
import test from 'node:test';

import { updateSubCategoryServer } from '../src/server/fns/taxonomy.ts';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  assertAppError,
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'subcategory identity enforces category targets and protects locked history',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_target_integrity_co_1');
    const userId = asUserId('itest_target_integrity_usr_1');
    const projectId = asProjectId('itest_target_integrity_prj_1');
    const categoryAId = asCategoryId('itest_target_integrity_cat_a');
    const categoryBId = asCategoryId('itest_target_integrity_cat_b');
    const subCategoryId = asSubCategoryId('itest_target_integrity_sub_1');
    const txnId = asTxnId('itest_target_integrity_txn_1');
    const now = new Date().toISOString();
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Target Integrity Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'target-integrity@example.com',
          name: 'Target Integrity Lead',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'member' })
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Target Integrity Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 100_000,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          sync_company_defaults: false,
          allow_txn_transfers: false,
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();
      await db
        .insertInto('categories')
        .values([
          {
            id: categoryAId,
            company_id: companyId,
            project_id: projectId,
            name: 'Category A',
            created_at: now,
            updated_at: now,
          },
          {
            id: categoryBId,
            company_id: companyId,
            project_id: projectId,
            name: 'Category B',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();
      await db
        .insertInto('sub_categories')
        .values({
          id: subCategoryId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryAId,
          name: 'Shared Name',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'TARGET-INTEGRITY-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-07-01',
          item: 'Integrity test',
          description: 'Valid category target',
          amount_cents: 100,
          txn_type: 'standard',
          category_id: categoryAId,
          sub_category_id: subCategoryId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('budget_lines')
        .values({
          id: asBudgetLineId('itest_target_integrity_budget_1'),
          company_id: companyId,
          project_id: projectId,
          category_id: categoryAId,
          sub_category_id: subCategoryId,
          allocated_cents: 0,
          created_at: now,
          updated_at: now,
        })
        .execute();

      await assert.rejects(
        db
          .insertInto('txns')
          .values({
            public_id: asTxnId('itest_target_integrity_txn_bad'),
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-07-02',
            item: 'Invalid target',
            description: 'Wrong category for subcategory',
            amount_cents: 100,
            txn_type: 'standard',
            category_id: categoryBId,
            sub_category_id: subCategoryId,
          })
          .execute(),
        /fk_txns_subcategory_category_target/
      );
      await assert.rejects(
        db
          .updateTable('budget_lines')
          .set({ category_id: categoryBId })
          .where('project_id', '=', projectId)
          .where('sub_category_id', '=', subCategoryId)
          .execute(),
        /fk_budget_lines_subcategory_category_target/
      );

      await db
        .updateTable('sub_categories')
        .set({ category_id: categoryBId, updated_at: now })
        .where('id', '=', subCategoryId)
        .execute();
      const [movedTxn, movedBudget] = await Promise.all([
        db
          .selectFrom('txns')
          .select('category_id')
          .where('public_id', '=', txnId)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('budget_lines')
          .select('category_id')
          .where('sub_category_id', '=', subCategoryId)
          .executeTakeFirstOrThrow(),
      ]);
      assert.equal(movedTxn.category_id, categoryBId);
      assert.equal(movedBudget.category_id, categoryBId);

      await db
        .updateTable('txns')
        .set({
          reviewed_at: now,
          reviewed_by_user_id: userId,
          locked_at: now,
          locked_by_user_id: userId,
        })
        .where('public_id', '=', txnId)
        .execute();
      await assertAppError(
        () =>
          updateSubCategoryServer({
            context,
            projectId,
            input: { id: subCategoryId, categoryId: categoryAId },
          }),
        'VALIDATION_ERROR',
        'Subcategory cannot be moved while locked transactions use it'
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
