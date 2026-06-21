import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectServer,
  updateProjectServer,
} from '../src/server/fns/projects.ts';
import {
  createCompanyDefaultCategoryServer,
  createCompanyDefaultSubCategoryServer,
  deleteCompanyDefaultCategoryServer,
  listCategoriesServer,
  listSubCategoriesServer,
  promoteProjectSubCategoryToCompanyDefaultServer,
  updateCategoryServer,
  updateCompanyDefaultCategoryServer,
  updateSubCategoryServer,
} from '../src/server/fns/taxonomy.ts';
import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asUserId,
} from '../src/types/index.ts';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'enabling sync_company_defaults on an existing project backfills current company defaults and stores the flag',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_sync_toggle_co_1');
    const userId = asUserId('itest_sync_toggle_usr_1');
    const projectId = asProjectId('itest_sync_toggle_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_sync_toggle_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_sync_toggle_dsub_1'
    );
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Sync Toggle Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'sync-toggle@example.com',
          name: 'Sync Toggle User',
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
          name: 'Sync Toggle Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
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
        .insertInto('company_default_categories')
        .values({
          id: defaultCategoryId,
          company_id: companyId,
          name: 'Travel',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Flights',
          created_at: now,
          updated_at: now,
        })
        .execute();

      const updated = await updateProjectServer({
        context: { session: { userId } },
        input: {
          id: projectId,
          syncCompanyDefaults: true,
        },
      });
      assert.equal(updated.syncCompanyDefaults, true);

      const projectCategory = await db
        .selectFrom('categories')
        .select('name')
        .where('project_id', '=', projectId)
        .where('name', '=', 'Travel')
        .executeTakeFirst();
      const projectSubCategory = await db
        .selectFrom('sub_categories')
        .select('name')
        .where('project_id', '=', projectId)
        .where('name', '=', 'Flights')
        .executeTakeFirst();
      assert.equal(projectCategory?.name, 'Travel');
      assert.equal(projectSubCategory?.name, 'Flights');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'synced project taxonomy inherits provenance, allows project overrides, and detaches when company defaults are removed',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_taxonomy_sync_co_1');
    const userId = asUserId('itest_taxonomy_sync_usr_1');
    const projectId = asProjectId('itest_taxonomy_sync_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_taxonomy_sync_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_taxonomy_sync_dsub_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Taxonomy Sync Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'taxonomy-sync@example.com',
          name: 'Taxonomy Sync User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          companyId,
          name: 'Travel',
        },
      });
      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: defaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: defaultCategoryId,
          name: 'Flights',
        },
      });

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Taxonomy Sync Project',
        },
      });

      const inheritedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      const inheritedSubCategories = await listSubCategoriesServer({
        context,
        projectId,
      });

      assert.equal(inheritedCategories.length, 1);
      assert.equal(inheritedCategories[0]?.name, 'Travel');
      assert.equal(inheritedCategories[0]?.originScope, 'company');
      assert.equal(
        inheritedCategories[0]?.originCompanyItemId,
        defaultCategoryId
      );
      assert.equal(inheritedCategories[0]?.syncStatus, 'inherited');

      assert.equal(inheritedSubCategories.length, 1);
      assert.equal(inheritedSubCategories[0]?.name, 'Flights');
      assert.equal(inheritedSubCategories[0]?.originScope, 'company');
      assert.equal(
        inheritedSubCategories[0]?.originCompanyItemId,
        defaultSubCategoryId
      );
      assert.equal(inheritedSubCategories[0]?.syncStatus, 'inherited');

      await updateCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          name: 'Travel and Transport',
        },
      });

      const renamedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(renamedCategories[0]?.name, 'Travel and Transport');
      assert.equal(renamedCategories[0]?.syncStatus, 'inherited');

      await updateCategoryServer({
        context,
        projectId,
        input: {
          id: inheritedCategories[0]!.id,
          name: 'Travel Local Override',
        },
      });

      const overriddenCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(overriddenCategories[0]?.name, 'Travel Local Override');
      assert.equal(overriddenCategories[0]?.syncStatus, 'overridden');

      await updateCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          name: 'Travel Final Canonical',
        },
      });

      const preservedOverrideCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(
        preservedOverrideCategories[0]?.name,
        'Travel Local Override'
      );
      assert.equal(preservedOverrideCategories[0]?.syncStatus, 'overridden');

      await deleteCompanyDefaultCategoryServer({
        context,
        companyId,
        categoryId: defaultCategoryId,
      });

      const detachedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(detachedCategories.length, 1);
      assert.equal(detachedCategories[0]?.name, 'Travel Local Override');
      assert.equal(detachedCategories[0]?.originScope, 'company');
      assert.equal(
        detachedCategories[0]?.originCompanyItemId,
        defaultCategoryId
      );
      assert.equal(detachedCategories[0]?.syncStatus, 'detached');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'reverting an overridden inherited taxonomy item back to the company shape restores inherited status and avoids duplicate promotion',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_taxonomy_revert_co_1');
    const userId = asUserId('itest_taxonomy_revert_usr_1');
    const projectId = asProjectId('itest_taxonomy_revert_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_taxonomy_revert_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_taxonomy_revert_dsub_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Taxonomy Revert Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'taxonomy-revert@example.com',
          name: 'Taxonomy Revert User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          companyId,
          name: 'IT',
        },
      });
      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: defaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: defaultCategoryId,
          name: 'Software and Services',
        },
      });

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Taxonomy Revert Project',
        },
      });

      const inheritedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      const inheritedSubCategories = await listSubCategoriesServer({
        context,
        projectId,
      });
      const categoryId = inheritedCategories[0]!.id;
      const subCategoryId = inheritedSubCategories[0]!.id;

      await updateCategoryServer({
        context,
        projectId,
        input: { id: categoryId, name: 'IT Local' },
      });
      await updateSubCategoryServer({
        context,
        projectId,
        input: { id: subCategoryId, name: 'Software Local' },
      });

      await updateCategoryServer({
        context,
        projectId,
        input: { id: categoryId, name: 'IT' },
      });
      await updateSubCategoryServer({
        context,
        projectId,
        input: { id: subCategoryId, name: 'Software and Services' },
      });

      const revertedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      const revertedSubCategories = await listSubCategoriesServer({
        context,
        projectId,
      });
      assert.equal(revertedCategories[0]?.syncStatus, 'inherited');
      assert.equal(revertedSubCategories[0]?.syncStatus, 'inherited');

      const promotionResult =
        await promoteProjectSubCategoryToCompanyDefaultServer({
          context,
          projectId,
          input: { subCategoryId },
        });
      assert.equal(promotionResult.categoryCreated, false);
      assert.equal(promotionResult.subCategoryCreated, false);

      const companyDefaultCategoryCount = await db
        .selectFrom('company_default_categories')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('company_id', '=', companyId)
        .executeTakeFirstOrThrow();
      const companyDefaultSubCategoryCount = await db
        .selectFrom('company_default_sub_categories')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('company_id', '=', companyId)
        .executeTakeFirstOrThrow();
      assert.equal(Number(companyDefaultCategoryCount.count), 1);
      assert.equal(Number(companyDefaultSubCategoryCount.count), 1);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
