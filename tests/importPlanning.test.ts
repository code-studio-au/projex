import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../src/api/errors.ts';
import type {
  BudgetLine,
  Category,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  SubCategory,
  Txn,
} from '../src/types/index.ts';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
} from '../src/types/index.ts';
import { planImportPreview } from '../src/utils/importPreviewPlan.ts';
import { planTransactionImportCommit } from '../src/utils/transactionImportCommitPlan.ts';

const companyId = asCompanyId('co_1');
const projectId = asProjectId('prj_1');
const otherCompanyId = asCompanyId('co_2');
const otherProjectId = asProjectId('prj_2');

const category: Category = {
  id: asCategoryId('cat_travel'),
  companyId,
  projectId,
  name: 'Travel',
};

const subCategory: SubCategory = {
  id: asSubCategoryId('sub_flights'),
  companyId,
  projectId,
  categoryId: category.id,
  name: 'Flights',
};

const defaultCategory: CompanyDefaultCategory = {
  id: asCompanyDefaultCategoryId('ccat_travel'),
  companyId,
  name: 'Travel',
};

const defaultSubCategory: CompanyDefaultSubCategory = {
  id: asCompanyDefaultSubCategoryId('csub_flights'),
  companyId,
  companyDefaultCategoryId: defaultCategory.id,
  name: 'Flights',
};

const mappingRule: CompanyDefaultMappingRule = {
  id: asCompanyDefaultMappingRuleId('rule_flight'),
  companyId,
  matchText: 'flight',
  companyDefaultCategoryId: defaultCategory.id,
  companyDefaultSubCategoryId: defaultSubCategory.id,
  sortOrder: 0,
};

function txn(overrides: Partial<Txn> = {}): Txn {
  return {
    id: asTxnId('txn_1'),
    externalId: 'bank-1',
    companyId,
    projectId,
    date: '2026-04-28',
    item: 'Flight',
    description: 'Sydney to Melbourne',
    amountCents: 12500,
    ...overrides,
  };
}

function planImport(
  overrides: {
    incomingTransactions?: Txn[];
    existingTransactions?: Txn[];
    existingBudgets?: BudgetLine[];
    mode?: 'append' | 'replaceAll';
    autoCreateBudgets?: boolean;
  } = {}
) {
  return planTransactionImportCommit({
    projectId,
    companyId,
    incomingTransactions: overrides.incomingTransactions ?? [txn()],
    existingTransactions: overrides.existingTransactions ?? [],
    existingBudgets: overrides.existingBudgets ?? [],
    defaultCategories: [defaultCategory],
    defaultSubCategories: [defaultSubCategory],
    mappingRules: [mappingRule],
    projectCategories: [category],
    projectSubCategories: [subCategory],
    mode: overrides.mode ?? 'append',
    autoCreateBudgets: overrides.autoCreateBudgets ?? false,
  });
}

function assertAppError(
  run: () => unknown,
  code: AppError['code'],
  message: string
) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  });
}

test('transaction import commit rejects transactions outside the target scope', () => {
  assertAppError(
    () =>
      planImport({
        incomingTransactions: [txn({ projectId: otherProjectId })],
      }),
    'VALIDATION_ERROR',
    'Transaction projectId does not match import target'
  );

  assertAppError(
    () =>
      planImport({
        incomingTransactions: [txn({ companyId: otherCompanyId })],
      }),
    'VALIDATION_ERROR',
    'Transaction companyId does not match project company'
  );
});

test('transaction import commit rejects duplicate external ids in append mode', () => {
  assertAppError(
    () =>
      planImport({
        existingTransactions: [txn({ id: asTxnId('txn_existing') })],
        incomingTransactions: [txn({ id: asTxnId('txn_new') })],
      }),
    'VALIDATION_ERROR',
    'Duplicate transaction externalId in project: bank-1'
  );
});

test('transaction import commit applies company defaults and creates missing budget targets', () => {
  const result = planImport({ autoCreateBudgets: true });

  assert.equal(result.importedTransactions.length, 1);
  assert.equal(result.importedTransactions[0].categoryId, category.id);
  assert.equal(result.importedTransactions[0].subCategoryId, subCategory.id);
  assert.equal(
    result.importedTransactions[0].companyDefaultMappingRuleId,
    mappingRule.id
  );
  assert.equal(
    result.importedTransactions[0].codingSource,
    'company_default_rule'
  );
  assert.equal(result.importedTransactions[0].codingPendingApproval, true);
  assert.deepEqual(result.budgetTargetsToCreate, [
    { categoryId: category.id, subCategoryId: subCategory.id },
  ]);
});

test('transaction import commit skips budget targets that already exist', () => {
  const existingBudget: BudgetLine = {
    id: asBudgetLineId('bud_1'),
    companyId,
    projectId,
    categoryId: category.id,
    subCategoryId: subCategory.id,
    allocatedCents: 0,
  };

  const result = planImport({
    autoCreateBudgets: true,
    existingBudgets: [existingBudget],
  });

  assert.deepEqual(result.budgetTargetsToCreate, []);
});

test('import preview marks existing duplicates and invalid rows', () => {
  const result = planImportPreview({
    csvText: [
      'id,date,item,description,amount',
      'bank-1,2026-04-28,Flight,Sydney to Melbourne,125.00',
      'bank-2,not-a-date,Hotel,Conference stay,200.00',
    ].join('\n'),
    existingTransactions: [
      { id: asTxnId('txn_existing'), externalId: 'bank-1' },
    ],
    categories: [category],
    subCategories: [subCategory],
    budgets: [],
    defaultCategories: [defaultCategory],
    defaultSubCategories: [defaultSubCategory],
    mappingRules: [mappingRule],
    autoCreateStructures: false,
    canEditTaxonomy: false,
    canEditBudgets: false,
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].duplicate, true);
  assert.equal(result.rows[0].duplicateReason, 'existing');
  assert.equal(result.rows[0].mappingStatus, 'matched_rule');
  assert.equal(result.rows[1].mappingStatus, 'invalid');
  assert.match(
    result.rows[1].warnings.join('\n'),
    /Transaction date must be YYYY-MM-DD/
  );
});
