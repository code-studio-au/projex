import assert from 'node:assert/strict';
import test from 'node:test';

import { applyCompanyStandardsServer } from '../src/server/fns/taxonomy';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyId,
  asProjectId,
  asUserId,
} from '../src/types';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers';

test(
  'project standard provenance constraints reject invalid states and reconciliation is idempotent',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_provenance_co_1');
    const projectId = asProjectId('itest_provenance_prj_1');
    const userId = asUserId('itest_provenance_usr_1');
    const localCategoryId = asCategoryId('itest_provenance_local_cat_1');
    const invalidCategoryId = asCategoryId('itest_provenance_bad_cat_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_provenance_default_cat_1'
    );
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Provenance Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'provenance@example.com',
          name: 'Provenance User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Provenance Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          sync_company_defaults: true,
          allow_txn_transfers: false,
        })
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: localCategoryId,
          company_id: companyId,
          project_id: projectId,
          name: 'Local',
          created_at: now,
          updated_at: now,
        })
        .execute();
      const localCategory = await db
        .selectFrom('categories')
        .select([
          'origin_scope',
          'origin_company_item_id',
          'sync_status',
          'last_synced_at',
          'source_updated_at_snapshot',
        ])
        .where('id', '=', localCategoryId)
        .executeTakeFirstOrThrow();
      assert.equal(localCategory.origin_scope, 'project');
      assert.equal(localCategory.sync_status, 'local');
      assert.ok(localCategory.last_synced_at);
      assert.equal(localCategory.source_updated_at_snapshot, null);

      await assert.rejects(
        db
          .insertInto('categories')
          .values({
            id: invalidCategoryId,
            company_id: companyId,
            project_id: projectId,
            name: 'Invalid inherited state',
            origin_scope: 'company',
            origin_company_item_id: null,
            sync_status: 'inherited',
            last_synced_at: now,
            source_updated_at_snapshot: now,
            created_at: now,
            updated_at: now,
          })
          .execute(),
        /chk_categories_standard_provenance/
      );

      await db
        .insertInto('company_default_categories')
        .values({
          id: defaultCategoryId,
          company_id: companyId,
          name: 'Inherited',
          created_at: now,
          updated_at: now,
        })
        .execute();

      await applyCompanyStandardsServer({
        context: { session: { userId } },
        projectId,
      });
      await applyCompanyStandardsServer({
        context: { session: { userId } },
        projectId,
      });

      const inheritedRows = await db
        .selectFrom('categories')
        .select(['id', 'origin_scope', 'origin_company_item_id', 'sync_status'])
        .where('project_id', '=', projectId)
        .where('origin_company_item_id', '=', defaultCategoryId)
        .execute();
      assert.equal(inheritedRows.length, 1);
      assert.equal(inheritedRows[0]?.origin_scope, 'company');
      assert.equal(inheritedRows[0]?.sync_status, 'inherited');

      const auditCount = await db
        .selectFrom('audit_events')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('project_id', '=', projectId)
        .where('event_type', '=', 'company_standards.reconciled')
        .executeTakeFirstOrThrow();
      assert.ok(Number(auditCount.count) >= 2);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
