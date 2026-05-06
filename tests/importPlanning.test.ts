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
import { planTransactionSplit } from '../src/utils/transactionSplitPlan.ts';
import { planTransactionTransfer } from '../src/utils/transactionTransferPlan.ts';
import {
  assertTxnCodingAllowed,
  withStandardTxnAccountingMetadata,
} from '../src/utils/transactions.ts';
import { buildCompanySummaryProjects } from '../src/utils/companySummary.ts';

const companyId = asCompanyId('co_1');
const projectId = asProjectId('prj_1');
const programmeId = asProjectId('prg_1');
const otherCompanyId = asCompanyId('co_2');
const otherProjectId = asProjectId('prj_2');
const destinationProjectId = asProjectId('prj_destination');

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
  return withStandardTxnAccountingMetadata({
    id: asTxnId('txn_1'),
    externalId: 'bank-1',
    companyId,
    projectId,
    date: '2026-04-28',
    item: 'Flight',
    description: 'Sydney to Melbourne',
    amountCents: 12500,
    ...overrides,
  });
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

test('company summary excludes non-budget-impact transaction markers', () => {
  const projects = [
    {
      id: projectId,
      name: 'Project One',
      projectType: 'project' as const,
      parentProjectId: undefined,
      status: 'active' as const,
      visibility: 'company' as const,
      currency: 'AUD' as const,
      budgetTotalCents: 50000,
    },
  ];

  const result = buildCompanySummaryProjects({
    projects,
    validSubCategoryIdsByProject: new Map([
      [projectId, new Set<string>([subCategory.id])],
    ]),
    transactions: [
      {
        projectId,
        date: '2026-04-28',
        amountCents: 12500,
        budgetImpact: true,
        subCategoryId: subCategory.id,
      },
      {
        projectId,
        date: '2026-04-28',
        amountCents: 12500,
        budgetImpact: false,
        subCategoryId: null,
      },
    ],
  });

  assert.equal(result[0].months.length, 1);
  assert.equal(result[0].months[0].actualCodedCents, 12500);
  assert.equal(result[0].months[0].uncodedCount, 0);
  assert.equal(result[0].months[0].uncodedAmountCents, 0);
});

test('company summary rolls sub-project totals into programmes', () => {
  const childProjectId = asProjectId('prj_child');
  const result = buildCompanySummaryProjects({
    projects: [
      {
        id: programmeId,
        name: 'Programme One',
        projectType: 'programme' as const,
        parentProjectId: undefined,
        status: 'active' as const,
        visibility: 'company' as const,
        currency: 'AUD' as const,
        budgetTotalCents: 0,
      },
      {
        id: childProjectId,
        name: 'Child Project',
        projectType: 'project' as const,
        parentProjectId: programmeId,
        status: 'active' as const,
        visibility: 'company' as const,
        currency: 'AUD' as const,
        budgetTotalCents: 75000,
      },
    ],
    validSubCategoryIdsByProject: new Map([
      [childProjectId, new Set<string>([subCategory.id])],
    ]),
    transactions: [
      {
        projectId: childProjectId,
        date: '2026-04-28',
        amountCents: 15000,
        budgetImpact: true,
        subCategoryId: subCategory.id,
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].projectType, 'programme');
  assert.equal(result[0].budgetCents, 75000);
  assert.equal(result[0].months[0].actualCodedCents, 15000);
  assert.equal(result[0].children?.length, 1);
  assert.equal(result[0].children?.[0].id, childProjectId);
});

test('company summary keeps active sub-projects visible when programme is archived', () => {
  const childProjectId = asProjectId('prj_child');
  const result = buildCompanySummaryProjects({
    projects: [
      {
        id: programmeId,
        name: 'Archived Programme',
        projectType: 'programme' as const,
        parentProjectId: undefined,
        status: 'archived' as const,
        visibility: 'company' as const,
        currency: 'AUD' as const,
        budgetTotalCents: 0,
      },
      {
        id: childProjectId,
        name: 'Active Child Project',
        projectType: 'project' as const,
        parentProjectId: programmeId,
        status: 'active' as const,
        visibility: 'company' as const,
        currency: 'AUD' as const,
        budgetTotalCents: 75000,
      },
    ],
    validSubCategoryIdsByProject: new Map([
      [childProjectId, new Set<string>([subCategory.id])],
    ]),
    transactions: [
      {
        projectId: childProjectId,
        date: '2026-04-28',
        amountCents: 15000,
        budgetImpact: true,
        subCategoryId: subCategory.id,
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].projectType, 'programme');
  assert.deepEqual(result[0].children, []);
  assert.equal(result[1].id, childProjectId);
  assert.equal(result[1].budgetCents, 75000);
  assert.equal(result[1].months[0].actualCodedCents, 15000);
});

test('transaction coding guard rejects source markers with coding metadata', () => {
  assertAppError(
    () =>
      assertTxnCodingAllowed(
        txn({
          txnType: 'split_parent',
          budgetImpact: false,
          categorisable: false,
          categoryId: category.id,
        })
      ),
    'VALIDATION_ERROR',
    'Transaction cannot be coded because it is a source marker'
  );
});

test('transaction split plan creates a non-budget parent and budget-impact children', () => {
  const result = planTransactionSplit({
    parent: txn(),
    now: '2026-05-05T00:00:00.000Z',
    createTxnId: () => asTxnId('txn_generated_child'),
    children: [
      {
        id: asTxnId('txn_child_1'),
        amountCents: 5000,
        categoryId: category.id,
        subCategoryId: subCategory.id,
      },
      {
        id: asTxnId('txn_child_2'),
        item: 'Hotel',
        description: 'Conference hotel',
        amountCents: 7500,
      },
    ],
  });

  assert.equal(result.parent.txnType, 'split_parent');
  assert.equal(result.parent.budgetImpact, false);
  assert.equal(result.parent.categorisable, false);
  assert.equal(result.parent.categoryId, undefined);
  assert.equal(result.parent.subCategoryId, undefined);

  assert.equal(result.children.length, 2);
  assert.equal(result.children[0].txnType, 'split_child');
  assert.equal(result.children[0].parentTxnId, result.parent.id);
  assert.equal(result.children[0].budgetImpact, true);
  assert.equal(result.children[0].categorisable, true);
  assert.equal(result.children[0].codingSource, 'manual');
  assert.equal(result.children[1].item, 'Hotel');
  assert.equal(result.children[1].codingSource, undefined);
});

test('transaction split plan rejects remainder amounts', () => {
  assertAppError(
    () =>
      planTransactionSplit({
        parent: txn(),
        now: '2026-05-05T00:00:00.000Z',
        createTxnId: () => asTxnId('txn_generated_child'),
        children: [{ amountCents: 5000 }, { amountCents: 7000 }],
      }),
    'VALIDATION_ERROR',
    'Split child amounts must exactly equal the parent transaction amount'
  );
});

test('transaction transfer plan creates a source marker and uncoded destination transaction', () => {
  const result = planTransactionTransfer({
    source: txn({
      categoryId: category.id,
      subCategoryId: subCategory.id,
      codingSource: 'manual',
    }),
    destinationCompanyId: companyId,
    now: '2026-05-05T00:00:00.000Z',
    createTxnId: () => asTxnId('txn_transfer_child'),
    input: {
      txnId: asTxnId('txn_1'),
      destinationProjectId,
    },
  });

  assert.equal(result.source.txnType, 'transfer_source');
  assert.equal(result.source.transferProjectId, destinationProjectId);
  assert.equal(result.source.budgetImpact, false);
  assert.equal(result.source.categorisable, false);
  assert.equal(result.source.categoryId, undefined);
  assert.equal(result.source.subCategoryId, undefined);

  assert.equal(result.destination.id, asTxnId('txn_transfer_child'));
  assert.equal(result.destination.projectId, destinationProjectId);
  assert.equal(result.destination.txnType, 'transfer_child');
  assert.equal(result.destination.sourceTxnId, result.source.id);
  assert.equal(result.destination.transferProjectId, projectId);
  assert.equal(result.destination.budgetImpact, true);
  assert.equal(result.destination.categorisable, true);
  assert.equal(result.destination.categoryId, undefined);
  assert.equal(result.destination.subCategoryId, undefined);
});

test('transaction transfer plan rejects cross-company destinations', () => {
  assertAppError(
    () =>
      planTransactionTransfer({
        source: txn(),
        destinationCompanyId: otherCompanyId,
        now: '2026-05-05T00:00:00.000Z',
        createTxnId: () => asTxnId('txn_transfer_child'),
        input: {
          txnId: asTxnId('txn_1'),
          destinationProjectId,
        },
      }),
    'VALIDATION_ERROR',
    'Transactions can only be moved within the same company'
  );
});
