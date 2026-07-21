import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sql } from 'kysely';

import { createProjectServer } from '../src/server/fns/projects.ts';
import { previewImportTransactionsServer } from '../src/server/fns/transactions.ts';
import {
  createImportRuleServer,
  createProjectImportRuleServer,
  deleteImportRuleServer,
  listImportRulesServer,
  listProjectImportRulesServer,
  promoteProjectImportRuleServer,
  seedCompanyImportRuleBaseline,
  updateImportRuleServer,
  updateProjectImportRuleServer,
} from '../src/server/fns/importRules.ts';
import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import { asCompanyId, asProjectId, asUserId } from '../src/types/index.ts';
import {
  assertAppErrorCode,
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'EXA baseline retirement removes untouched seeds while preserving customized rules',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_exa_retirement_co_1');
    const projectId = asProjectId('itest_exa_retirement_prj_1');
    const seededRuleId = 'itest_exa_retirement_seed_1';
    const inheritedRuleId = 'itest_exa_retirement_inherited_1';
    const overriddenRuleId = 'itest_exa_retirement_overridden_1';
    const editedCompanyRuleId = 'itest_exa_retirement_edited_1';
    const createdAt = '2026-07-01T00:00:00.000Z';

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'EXA Retirement Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'EXA Retirement Project',
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
        .insertInto('import_rules')
        .values([
          {
            id: seededRuleId,
            company_id: companyId,
            project_id: null,
            name: 'Exclude EXA unacquitted Concur source',
            origin_scope: null,
            origin_company_item_id: null,
            sync_status: null,
            last_synced_at: null,
            source_updated_at_snapshot: null,
            action: 'exclude',
            field: 'source',
            operator: 'equals',
            value: 'EXA',
            sort_order: 20,
            enabled: true,
            created_at: createdAt,
            updated_at: createdAt,
          },
          {
            id: inheritedRuleId,
            company_id: companyId,
            project_id: projectId,
            name: 'Exclude EXA unacquitted Concur source',
            origin_scope: 'company',
            origin_company_item_id: seededRuleId,
            sync_status: 'inherited',
            last_synced_at: createdAt,
            source_updated_at_snapshot: createdAt,
            action: 'exclude',
            field: 'source',
            operator: 'equals',
            value: 'EXA',
            sort_order: 20,
            enabled: true,
            created_at: createdAt,
            updated_at: createdAt,
          },
          {
            id: overriddenRuleId,
            company_id: companyId,
            project_id: projectId,
            name: 'Review selected EXA source',
            origin_scope: 'company',
            origin_company_item_id: seededRuleId,
            sync_status: 'overridden',
            last_synced_at: createdAt,
            source_updated_at_snapshot: createdAt,
            action: 'review',
            field: 'source',
            operator: 'equals',
            value: 'EXA',
            sort_order: 20,
            enabled: true,
            created_at: createdAt,
            updated_at: '2026-07-02T00:00:00.000Z',
          },
          {
            id: editedCompanyRuleId,
            company_id: companyId,
            project_id: null,
            name: 'Exclude EXA unacquitted Concur source',
            origin_scope: null,
            origin_company_item_id: null,
            sync_status: null,
            last_synced_at: null,
            source_updated_at_snapshot: null,
            action: 'exclude',
            field: 'source',
            operator: 'equals',
            value: 'EXA',
            sort_order: 20,
            enabled: true,
            created_at: createdAt,
            updated_at: '2026-07-02T00:00:00.000Z',
          },
        ])
        .execute();

      const migrationSql = await readFile(
        new URL(
          '../src/server/db/migrations/0016_retire_seeded_exa_import_rule.sql',
          import.meta.url
        ),
        'utf8'
      );
      await sql.raw(migrationSql).execute(db);

      const remainingRules = await db
        .selectFrom('import_rules')
        .select(['id', 'sync_status'])
        .where('company_id', '=', companyId)
        .orderBy('id', 'asc')
        .execute();
      assert.deepEqual(remainingRules, [
        { id: editedCompanyRuleId, sync_status: null },
        { id: overriddenRuleId, sync_status: 'detached' },
      ]);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.destroy();
    }
  }
);

test(
  'seeded import rules keep EXA rows available for reversal matching',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_exa_baseline_co_1');
    const userId = asUserId('itest_exa_baseline_usr_1');
    const projectId = asProjectId('itest_exa_baseline_prj_1');
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'EXA Baseline Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'exa-baseline@example.com',
          name: 'EXA Baseline User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await seedCompanyImportRuleBaseline({ db, companyId });
      const companyRules = await listImportRulesServer({
        context,
        companyId,
      });
      assert.equal(
        companyRules.some(
          (rule) =>
            rule.field === 'source' &&
            rule.operator === 'equals' &&
            rule.value === 'EXA' &&
            rule.action === 'exclude'
        ),
        false
      );

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'EXA Baseline Project',
        },
      });

      const preview = await previewImportTransactionsServer({
        context,
        projectId,
        csvText: [
          'Ledger,Expenditure Actuals,Journal Line Description,Journal ID,Journal Date,Journal Line,Journal Line Ref,Source,Vendor Name,CC and Description',
          'Actuals,125.00,Monthly accrual,EXA-100,2026-05-31,1,REF-100,EXA,Monthly accrual,5000 Operations',
        ].join('\n'),
        sourceType: 'powerbi_expenditure_actuals',
        fileName: 'exa-baseline.csv',
        autoCreateStructures: true,
      });

      assert.equal(preview.rows.length, 1);
      assert.equal(preview.rows[0]?.importAction, 'import');
      assert.equal(preview.rows[0]?.importRuleName, undefined);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'project import rules stay project-scoped until an admin promotes them',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_pimport_scope_co_1');
    const adminUserId = asUserId('itest_pimport_scope_admin_1');
    const leadUserId = asUserId('itest_pimport_scope_lead_1');
    const projectId = asProjectId('itest_pimport_scope_prj_1');

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [adminUserId, leadUserId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Project Import Scope Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: adminUserId,
            email: 'project-import-admin@example.com',
            name: 'Project Import Admin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: leadUserId,
            email: 'project-import-lead@example.com',
            name: 'Project Import Lead',
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
          { company_id: companyId, user_id: leadUserId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Project Import Scope Project',
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
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: adminUserId, role: 'owner' },
          { project_id: projectId, user_id: leadUserId, role: 'lead' },
        ])
        .execute();

      const createdProjectRule = await createProjectImportRuleServer({
        context: { session: { userId: leadUserId } },
        projectId,
        input: {
          companyId,
          projectId,
          scope: 'project',
          name: 'Exclude internal recharge rows',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'internal recharge',
          sortOrder: 10,
          enabled: true,
        },
      });
      assert.equal(createdProjectRule.scope, 'project');
      assert.equal(createdProjectRule.projectId, projectId);

      const projectRules = await listProjectImportRulesServer({
        context: { session: { userId: leadUserId } },
        projectId,
      });
      assert.equal(projectRules.length, 1);
      assert.equal(projectRules[0]?.id, createdProjectRule.id);
      assert.equal(projectRules[0]?.scope, 'project');

      const companyRulesBeforePromotion = await listImportRulesServer({
        context: { session: { userId: leadUserId } },
        companyId,
      });
      assert.equal(
        companyRulesBeforePromotion.some(
          (rule) => rule.id === createdProjectRule.id
        ),
        false
      );
      assert.ok(
        companyRulesBeforePromotion.every((rule) => rule.scope === 'company')
      );

      await assertAppErrorCode(
        () =>
          promoteProjectImportRuleServer({
            context: { session: { userId: leadUserId } },
            projectId,
            ruleId: createdProjectRule.id,
          }),
        'FORBIDDEN',
        'project import rule promotion requires company defaults permission'
      );

      const promotedCompanyRule = await promoteProjectImportRuleServer({
        context: { session: { userId: adminUserId } },
        projectId,
        ruleId: createdProjectRule.id,
      });
      assert.equal(promotedCompanyRule.scope, 'company');
      assert.equal(promotedCompanyRule.projectId, undefined);
      assert.equal(promotedCompanyRule.name, createdProjectRule.name);

      const companyRulesAfterPromotion = await listImportRulesServer({
        context: { session: { userId: adminUserId } },
        companyId,
      });
      assert.equal(
        companyRulesAfterPromotion.some(
          (rule) =>
            rule.id === promotedCompanyRule.id && rule.scope === 'company'
        ),
        true
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [adminUserId, leadUserId])
        .execute();
      await db.destroy();
    }
  }
);

test(
  'synced project import rules inherit provenance, support project overrides, and detach when company rules are removed',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_impr_sync_co_1');
    const userId = asUserId('itest_impr_sync_usr_1');
    const projectId = asProjectId('itest_impr_sync_prj_1');
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Import Rule Sync Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'impr-sync@example.com',
          name: 'Import Rule Sync User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Import Rule Sync Project',
        },
      });

      const createdCompanyRule = await createImportRuleServer({
        context,
        companyId,
        input: {
          companyId,
          scope: 'company',
          name: 'Exclude Internal Recharge',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'internal recharge',
          sortOrder: 90,
          enabled: true,
        },
      });

      const inheritedProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const inheritedProjectRule = inheritedProjectRules.find(
        (rule) => rule.originCompanyItemId === createdCompanyRule.id
      );
      assert.ok(inheritedProjectRule);
      assert.equal(inheritedProjectRule?.originScope, 'company');
      assert.equal(inheritedProjectRule?.syncStatus, 'inherited');
      assert.equal(inheritedProjectRule?.value, 'internal recharge');

      await updateImportRuleServer({
        context,
        companyId,
        input: {
          id: createdCompanyRule.id,
          value: 'internal recharge updated',
        },
      });

      const updatedProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const updatedInheritedRule = updatedProjectRules.find(
        (rule) => rule.originCompanyItemId === createdCompanyRule.id
      );
      assert.equal(updatedInheritedRule?.value, 'internal recharge updated');
      assert.equal(updatedInheritedRule?.syncStatus, 'inherited');

      await updateProjectImportRuleServer({
        context,
        projectId,
        input: {
          id: updatedInheritedRule!.id,
          value: 'project-local recharge override',
        },
      });

      const overriddenProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const overriddenRule = overriddenProjectRules.find(
        (rule) => rule.id === updatedInheritedRule!.id
      );
      assert.equal(overriddenRule?.value, 'project-local recharge override');
      assert.equal(overriddenRule?.syncStatus, 'overridden');

      await updateImportRuleServer({
        context,
        companyId,
        input: {
          id: createdCompanyRule.id,
          value: 'canonical recharge final',
        },
      });

      const preservedOverrideRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const preservedOverrideRule = preservedOverrideRules.find(
        (rule) => rule.id === updatedInheritedRule!.id
      );
      assert.equal(
        preservedOverrideRule?.value,
        'project-local recharge override'
      );
      assert.equal(preservedOverrideRule?.syncStatus, 'overridden');

      await deleteImportRuleServer({
        context,
        companyId,
        ruleId: createdCompanyRule.id,
      });

      const detachedProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const detachedRule = detachedProjectRules.find(
        (rule) => rule.id === updatedInheritedRule!.id
      );
      assert.equal(detachedRule?.originScope, 'company');
      assert.equal(detachedRule?.originCompanyItemId, createdCompanyRule.id);
      assert.equal(detachedRule?.syncStatus, 'detached');
      assert.equal(detachedRule?.value, 'project-local recharge override');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'project import preview gives project-local exclude rules precedence over inherited company review rules',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_import_preview_precedence_co_1');
    const userId = asUserId('itest_import_preview_precedence_usr_1');
    const projectId = asProjectId('itest_import_preview_precedence_prj_1');
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Import Preview Precedence Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'import-preview-precedence@example.com',
          name: 'Import Preview Precedence User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Import Preview Precedence Project',
        },
      });

      await createImportRuleServer({
        context,
        companyId,
        input: {
          companyId,
          scope: 'company',
          name: 'Review suspected salary transfer descriptions',
          action: 'review',
          field: 'journalLineDescription',
          operator: 'contains_any',
          value: 'sal,salary,salaries,payroll,wage,wages,suspense,trf',
          sortOrder: 60,
          enabled: true,
        },
      });

      await createProjectImportRuleServer({
        context,
        projectId,
        input: {
          companyId,
          projectId,
          scope: 'project',
          name: 'Exclude T02 source rows',
          action: 'exclude',
          field: 'source',
          operator: 'equals',
          value: 'T02',
          sortOrder: 10,
          enabled: true,
        },
      });

      const preview = await previewImportTransactionsServer({
        context,
        projectId,
        csvText: [
          'Ledger,Expenditure Actuals,Journal Line Description,Journal ID,Journal Date,Journal Line,Journal Line Ref,Source,Vendor Name,CC and Description',
          'Actuals,9338.26,15/12 Casuals General Sal,0000400200,2023-03-02,81,1156827,T02,15/12 Casuals General Sal,4103 (Casuals General Salary)',
        ].join('\n'),
        sourceType: 'powerbi_expenditure_actuals',
        fileName: 'precedence.csv',
        autoCreateStructures: true,
      });

      assert.equal(preview.rows.length, 1);
      assert.equal(preview.rows[0]?.importAction, 'exclude');
      assert.equal(preview.rows[0]?.importRuleName, 'Exclude T02 source rows');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);
