import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ProjectAutoCodingRule, Txn } from '../src/types/index.ts';
import {
  asCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyId,
  asProjectAutoCodingRuleId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
} from '../src/types/index.ts';
import {
  applyProjectAutoCodingRule,
  findMatchingProjectAutoCodingRule,
} from '../src/utils/projectAutoCodingRules.ts';

const baseTxn: Txn = {
  id: asTxnId('txn_1'),
  companyId: asCompanyId('co_1'),
  projectId: asProjectId('prj_1'),
  date: '2026-06-01',
  item: 'Flight reimbursement',
  description: 'Company policies flight',
  amountCents: 12345,
  txnType: 'standard',
  budgetImpact: true,
  categorisable: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  codingPendingApproval: false,
};

function rule(
  overrides: Partial<ProjectAutoCodingRule> = {}
): ProjectAutoCodingRule {
  return {
    id: asProjectAutoCodingRuleId('prule_1'),
    companyId: asCompanyId('co_1'),
    projectId: asProjectId('prj_1'),
    matchText: 'flight',
    categoryId: asCategoryId('cat_1'),
    subCategoryId: asSubCategoryId('sub_1'),
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    originScope: 'project',
    syncStatus: 'local',
    ...overrides,
  };
}

test('findMatchingProjectAutoCodingRule prioritizes local rules before inherited ones and sorts by sort order', () => {
  const matched = findMatchingProjectAutoCodingRule(baseTxn, [
    rule({
      id: asProjectAutoCodingRuleId('prule_inherited'),
      originScope: 'company',
      originCompanyItemId: 'rule_company',
      syncStatus: 'inherited',
      sortOrder: 0,
    }),
    rule({
      id: asProjectAutoCodingRuleId('prule_local'),
      sortOrder: 2,
    }),
  ]);

  assert.equal(matched?.id, 'prule_local');
});

test('findMatchingProjectAutoCodingRule uses createdAt as final stable tie-breaker', () => {
  const matched = findMatchingProjectAutoCodingRule(baseTxn, [
    rule({
      id: asProjectAutoCodingRuleId('prule_later'),
      createdAt: '2026-01-02T00:00:00.000Z',
    }),
    rule({
      id: asProjectAutoCodingRuleId('prule_earlier'),
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  ]);

  assert.equal(matched?.id, 'prule_earlier');
});

test('findMatchingProjectAutoCodingRule returns null for empty haystacks', () => {
  const matched = findMatchingProjectAutoCodingRule(
    { item: '   ', description: '' },
    [rule()]
  );
  assert.equal(matched, null);
});

test('findMatchingProjectAutoCodingRule returns null when no rule text matches the transaction', () => {
  const matched = findMatchingProjectAutoCodingRule(baseTxn, [
    rule({ matchText: 'hotel', sortOrder: 0 }),
    rule({ matchText: 'catering', sortOrder: 1 }),
  ]);

  assert.equal(matched, null);
});

test('applyProjectAutoCodingRule preserves already-coded transactions and applies inherited company rule provenance', () => {
  const coded = applyProjectAutoCodingRule({
    txn: {
      ...baseTxn,
      subCategoryId: asSubCategoryId('sub_existing'),
    },
    rules: [rule()],
  });
  assert.equal(coded.subCategoryId, 'sub_existing');

  const autoCoded = applyProjectAutoCodingRule({
    txn: baseTxn,
    rules: [
      rule({
        originScope: 'company',
        originCompanyItemId: 'rule_company',
        syncStatus: 'inherited',
      }),
    ],
  });

  assert.equal(autoCoded.categoryId, 'cat_1');
  assert.equal(autoCoded.subCategoryId, 'sub_1');
  assert.equal(
    autoCoded.companyDefaultMappingRuleId,
    asCompanyDefaultMappingRuleId('rule_company')
  );
  assert.equal(autoCoded.codingSource, 'company_default_rule');
  assert.equal(autoCoded.codingPendingApproval, true);
});

test('applyProjectAutoCodingRule falls back to project provenance when company inheritance is incomplete', () => {
  const autoCoded = applyProjectAutoCodingRule({
    txn: baseTxn,
    rules: [
      rule({
        originScope: 'company',
        syncStatus: 'inherited',
      }),
    ],
  });

  assert.equal(autoCoded.companyDefaultMappingRuleId, undefined);
  assert.equal(Object.hasOwn(autoCoded, 'companyDefaultMappingRuleId'), false);
  assert.equal(autoCoded.codingSource, 'project_rule');
});

test('applyProjectAutoCodingRule leaves transactions unchanged when no rule matches', () => {
  const untouched = applyProjectAutoCodingRule({
    txn: baseTxn,
    rules: [rule({ matchText: 'hotel' })],
  });

  assert.deepEqual(untouched, baseTxn);
});
