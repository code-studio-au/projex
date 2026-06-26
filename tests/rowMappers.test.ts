import assert from 'node:assert/strict';
import { test } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import {
  toTxn,
  toBudgetLine,
  toBudgetLines,
  type BudgetLineRow,
  type TxnRow,
} from '../src/server/mappers/transactionRows.ts';
import { toTxnComment } from '../src/server/mappers/transactionCommentRows.ts';
import {
  toCategory,
  toCompanyDefaultMappingRule,
  toSubCategory,
} from '../src/server/mappers/taxonomyRows.ts';

test('toTxn normalizes nullable fields and trims external ids', () => {
  const row: TxnRow = {
    id: '123',
    public_id: 'txn_1',
    external_id: '  EXT-001  ',
    company_id: 'co_1',
    project_id: 'prj_1',
    txn_date: '2026-06-01T00:00:00.000Z',
    item: 'Flight',
    description: 'Sydney to Melbourne',
    amount_cents: 12500,
    txn_type: 'standard',
    parent_public_id: null,
    source_public_id: null,
    transfer_project_id: null,
    budget_impact: true,
    categorisable: true,
    import_batch_id: 'batch_1',
    import_source_type: 'powerbi_expenditure_actuals',
    import_source_meta: { source: 'powerbi' },
    category_id: 'cat_1',
    sub_category_id: 'sub_1',
    company_default_mapping_rule_id: 'rule_1',
    coding_source: 'manual',
    coding_pending_approval: false,
    reviewed_at: '2026-06-02T00:00:00.000Z',
    reviewed_by_user_id: 'usr_review',
    locked_at: '2026-06-03T00:00:00.000Z',
    locked_by_user_id: 'usr_lock',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-03T00:00:00.000Z',
  };

  const txn = toTxn(row);

  assert.equal(txn.id, 'txn_1');
  assert.equal(txn.internalId, '123');
  assert.equal(txn.externalId, 'EXT-001');
  assert.equal(txn.date, '2026-06-01');
  assert.equal(txn.categoryId, 'cat_1');
  assert.equal(txn.subCategoryId, 'sub_1');
  assert.equal(txn.companyDefaultMappingRuleId, 'rule_1');
  assert.equal(txn.reviewedByUserId, 'usr_review');
  assert.equal(txn.lockedByUserId, 'usr_lock');
});

test('toTxn rejects invalid database dates with an app error', () => {
  const row: TxnRow = {
    id: '123',
    public_id: 'txn_1',
    external_id: null,
    company_id: 'co_1',
    project_id: 'prj_1',
    txn_date: 'not-a-date',
    item: 'Bad',
    description: 'Bad date',
    amount_cents: 100,
    txn_type: 'standard',
    parent_public_id: null,
    source_public_id: null,
    transfer_project_id: null,
    budget_impact: true,
    categorisable: true,
    category_id: null,
    sub_category_id: null,
    company_default_mapping_rule_id: null,
    coding_source: null,
    coding_pending_approval: false,
    reviewed_at: null,
    reviewed_by_user_id: null,
    locked_at: null,
    locked_by_user_id: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  assert.throws(
    () => toTxn(row),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.match(error.message, /Invalid transaction date/);
      return true;
    }
  );
});

test('budget line mappers skip uncategorized rows and preserve categorized ones', () => {
  const rows: BudgetLineRow[] = [
    {
      id: 'budget_1',
      company_id: 'co_1',
      project_id: 'prj_1',
      category_id: 'cat_1',
      sub_category_id: 'sub_1',
      allocated_cents: 20000,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'budget_2',
      company_id: 'co_1',
      project_id: 'prj_1',
      category_id: null,
      sub_category_id: null,
      allocated_cents: 5000,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
  ];

  const direct = toBudgetLine(rows[0]);
  const all = toBudgetLines(rows);

  assert.equal(direct?.id, 'budget_1');
  assert.equal(direct?.categoryId, 'cat_1');
  assert.equal(direct?.subCategoryId, 'sub_1');
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'budget_1');
});

test('taxonomy and comment mappers preserve optional origin and assignment fields', () => {
  const category = toCategory({
    id: 'cat_1',
    company_id: 'co_1',
    project_id: 'prj_1',
    name: 'Travel',
    origin_scope: 'company',
    origin_company_item_id: 'company_cat_1',
    sync_status: 'inherited',
    last_synced_at: '2026-06-01T00:00:00.000Z',
    source_updated_at_snapshot: '2026-05-31T00:00:00.000Z',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  });
  const subCategory = toSubCategory({
    id: 'sub_1',
    company_id: 'co_1',
    project_id: 'prj_1',
    category_id: 'cat_1',
    name: 'Flights',
    origin_scope: 'project',
    origin_company_item_id: null,
    sync_status: 'local',
    last_synced_at: null,
    source_updated_at_snapshot: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  });
  const mappingRule = toCompanyDefaultMappingRule({
    id: 'rule_1',
    company_id: 'co_1',
    match_text: 'flight',
    company_default_category_id: 'dcat_1',
    company_default_sub_category_id: 'dsub_1',
    sort_order: 3,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  });
  const comment = toTxnComment({
    id: 'comment_1',
    company_id: 'co_1',
    project_id: 'prj_1',
    txn_public_id: 'txn_1',
    parent_comment_id: null,
    body: 'Please confirm coding',
    assigned_to_user_id: 'usr_2',
    created_by_user_id: 'usr_1',
    created_by_name: 'Analyst',
    resolved_at: null,
    resolved_by_user_id: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  });

  assert.equal(category.originScope, 'company');
  assert.equal(category.originCompanyItemId, 'company_cat_1');
  assert.equal(subCategory.originScope, 'project');
  assert.equal(mappingRule.sortOrder, 3);
  assert.equal(comment.assignedToUserId, 'usr_2');
  assert.equal(comment.createdByName, 'Analyst');
});
