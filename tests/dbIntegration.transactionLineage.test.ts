import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteTxnServer,
  splitTxnServer,
  transferTxnServer,
} from '../src/server/fns/transactions.ts';
import {
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
  'split and transfer lineage is balanced and cannot be partially deleted',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_lineage_co_1');
    const userId = asUserId('itest_txn_lineage_usr_1');
    const sourceProjectId = asProjectId('itest_txn_lineage_prj_source');
    const destinationProjectId = asProjectId('itest_txn_lineage_prj_dest');
    const categoryId = asCategoryId('itest_txn_lineage_cat_1');
    const subCategoryId = asSubCategoryId('itest_txn_lineage_sub_1');
    const sourceTxnId = asTxnId('itest_txn_lineage_txn_source');
    const childOneId = asTxnId('itest_txn_lineage_txn_child_1');
    const childTwoId = asTxnId('itest_txn_lineage_txn_child_2');
    const destinationTxnId = asTxnId('itest_txn_lineage_txn_dest');
    const now = new Date().toISOString();
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Transaction Lineage Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-lineage@example.com',
          name: 'Transaction Lineage Lead',
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
        .values(
          [
            [sourceProjectId, 'Lineage Source'] as const,
            [destinationProjectId, 'Lineage Destination'] as const,
          ].map(([id, name]) => ({
            id,
            company_id: companyId,
            name,
            project_type: 'project' as const,
            parent_project_id: null,
            budget_total_cents: 100_000,
            currency: 'AUD' as const,
            status: 'active' as const,
            deactivated_at: null,
            visibility: 'private' as const,
            allow_superadmin_access: true,
            sync_company_defaults: false,
            allow_txn_transfers: true,
          }))
        )
        .execute();
      await db
        .insertInto('project_memberships')
        .values([
          { project_id: sourceProjectId, user_id: userId, role: 'lead' },
          { project_id: destinationProjectId, user_id: userId, role: 'lead' },
        ])
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: categoryId,
          company_id: companyId,
          project_id: sourceProjectId,
          name: 'Operations',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('sub_categories')
        .values({
          id: subCategoryId,
          company_id: companyId,
          project_id: sourceProjectId,
          category_id: categoryId,
          name: 'Services',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: sourceTxnId,
          company_id: companyId,
          project_id: sourceProjectId,
          txn_date: '2026-07-01',
          item: 'Consulting engagement',
          description: 'Original imported fact',
          amount_cents: 1_000,
          txn_type: 'standard',
          category_id: categoryId,
          sub_category_id: subCategoryId,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const split = await splitTxnServer({
        context,
        projectId: sourceProjectId,
        input: {
          txnId: sourceTxnId,
          children: [
            {
              id: childOneId,
              amountCents: 600,
              categoryId,
              subCategoryId,
            },
            {
              id: childTwoId,
              amountCents: 400,
              categoryId,
              subCategoryId,
            },
          ],
        },
      });
      assert.equal(split.parent.txnType, 'split_parent');
      assert.equal(split.children.length, 2);

      const splitLinks = await db
        .selectFrom('txn_links')
        .select(['link_type', 'amount_cents'])
        .where('source_txn_public_id', '=', sourceTxnId)
        .orderBy('amount_cents', 'asc')
        .execute();
      assert.deepEqual(
        splitLinks.map((link) => [link.link_type, Number(link.amount_cents)]),
        [
          ['split', 400],
          ['split', 600],
        ]
      );

      const transfer = await transferTxnServer({
        context,
        projectId: sourceProjectId,
        input: {
          txnId: childOneId,
          destinationProjectId,
          destinationTxnId,
        },
      });
      assert.equal(transfer.source.txnType, 'transfer_source');
      assert.equal(transfer.destination.txnType, 'transfer_child');

      const transferLink = await db
        .selectFrom('txn_links')
        .select([
          'link_type',
          'source_txn_public_id',
          'target_txn_public_id',
          'amount_cents',
        ])
        .where('target_txn_public_id', '=', destinationTxnId)
        .executeTakeFirstOrThrow();
      assert.deepEqual(
        {
          ...transferLink,
          amount_cents: Number(transferLink.amount_cents),
        },
        {
          link_type: 'transfer',
          source_txn_public_id: childOneId,
          target_txn_public_id: destinationTxnId,
          amount_cents: 600,
        }
      );

      await assertAppError(
        () =>
          deleteTxnServer({
            context,
            projectId: sourceProjectId,
            txnId: sourceTxnId,
          }),
        'CONFLICT',
        'Transaction belongs to a split or transfer and cannot be deleted independently'
      );
      await assert.rejects(
        db
          .updateTable('txns')
          .set({ amount_cents: 601 })
          .where('project_id', '=', destinationProjectId)
          .where('public_id', '=', destinationTxnId)
          .execute(),
        /Transfer lineage must contain one destination/
      );
      await assert.rejects(
        db
          .deleteFrom('txns')
          .where('project_id', '=', destinationProjectId)
          .where('public_id', '=', destinationTxnId)
          .execute(),
        /fk_txn_links_target/
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
