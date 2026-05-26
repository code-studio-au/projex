import assert from 'node:assert/strict';
import test from 'node:test';

import { Kysely, PostgresDialect } from 'kysely';
import type { PostgresDialectConfig } from 'kysely';

import { AppError } from '../src/api/errors.ts';
import { isAuthorized } from '../src/server/auth/authorize.ts';
import { createPgPool } from '../src/server/db/pgPool.ts';
import type { DB } from '../src/server/db/schema.ts';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireCompanyMember,
} from '../src/server/fns/resourceGuards.ts';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
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
