import assert from 'node:assert/strict';
import { test } from 'vitest';

import type {
  BudgetLine,
  Category,
  ImportTxnWithTaxonomy,
  ProjectAutoCodingRule,
  SubCategory,
} from '../src/types/index.ts';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asProjectAutoCodingRuleId,
  asProjectId,
  asSubCategoryId,
} from '../src/types/index.ts';
import { buildImportPreview } from '../src/utils/importPreview.ts';

const companyId = asCompanyId('co_1');
const projectId = asProjectId('prj_1');
const category: Category = {
  id: asCategoryId('cat_1'),
  companyId,
  projectId,
  name: 'Travel',
};
const subCategory: SubCategory = {
  id: asSubCategoryId('sub_1'),
  companyId,
  projectId,
  categoryId: category.id,
  name: 'Flights',
};
const rule: ProjectAutoCodingRule = {
  id: asProjectAutoCodingRuleId('prule_1'),
  companyId,
  projectId,
  matchText: 'flight',
  categoryId: category.id,
  subCategoryId: subCategory.id,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  originScope: 'company',
  originCompanyItemId: 'rule_company',
  syncStatus: 'inherited',
};

function importTxn(
  overrides: Partial<ImportTxnWithTaxonomy> = {}
): ImportTxnWithTaxonomy {
  return {
    id: 'row_1',
    externalId: 'EXT-1',
    date: '2026-06-01',
    item: 'Flight',
    description: 'Sydney to Melbourne',
    amountCents: 100,
    importSourceType: 'powerbi_expenditure_actuals',
    rawSourceRow: {},
    ...overrides,
  };
}

test('buildImportPreview auto-creates taxonomy and budgets when allowed', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        category: 'New Category',
        subcategory: 'New Sub',
      }) as never,
    ],
    existingKeys: new Set(),
    categories: [],
    subCategories: [],
    budgets: [],
    autoCreateTaxonomy: true,
    canEditTaxonomy: true,
    autoCreateBudgets: true,
    canEditBudgets: true,
  });

  assert.equal(rows[0].mappingStatus, 'auto_created');
  assert.equal(rows[0].willCreateCategory, true);
  assert.equal(rows[0].willCreateSubCategory, true);
  assert.equal(rows[0].willCreateBudgetLine, true);
});

test('buildImportPreview warns when provided taxonomy cannot be resolved and skips rule fallback', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        category: 'Missing Category',
        subcategory: 'Missing Sub',
      }) as never,
    ],
    existingKeys: new Set(),
    categories: [category],
    subCategories: [subCategory],
    budgets: [],
    projectAutoCodingRules: [rule],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: false,
    canEditBudgets: false,
  });

  assert.equal(rows[0].mappingStatus, 'uncoded');
  assert.equal(rows[0].categoryId, undefined);
  assert.match(rows[0].warnings.join('\n'), /left for manual review/);
});

test('buildImportPreview creates budget lines for existing subcategories without budgets and marks duplicates and review actions', () => {
  const budget: BudgetLine = {
    id: asBudgetLineId('bud_1'),
    companyId,
    projectId,
    categoryId: category.id,
    subCategoryId: undefined,
    allocatedCents: 0,
  };
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        categoryId: category.id,
        subCategoryId: subCategory.id,
        importAction: 'review',
        importRuleName: 'Manual Rule',
      }),
      importTxn({
        id: 'row_2',
        externalId: 'EXT-1',
        categoryId: category.id,
        subCategoryId: subCategory.id,
      }),
    ] as never,
    existingKeys: new Set(['external:EXT-1']),
    categories: [category],
    subCategories: [subCategory],
    budgets: [budget],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: true,
    canEditBudgets: true,
  });

  assert.equal(rows[0].willCreateBudgetLine, true);
  assert.match(rows[0].warnings.join('\n'), /Needs project review/);
  assert.equal(rows[1].duplicateReason, 'existing');
  assert.match(rows[1].warnings.join('\n'), /existing transaction/);
});

test('buildImportPreview warns on uncoded valid rows and exclude actions', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        importAction: 'exclude',
        importDecisionReason: 'Noise row',
      }),
    ] as never,
    existingKeys: new Set(),
    categories: [],
    subCategories: [],
    budgets: [],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: false,
    canEditBudgets: false,
  });

  assert.equal(rows[0].mappingStatus, 'uncoded');
  assert.match(rows[0].warnings.join('\n'), /No category\/subcategory/);
  assert.match(
    rows[0].warnings.join('\n'),
    /Excluded by import rule: Noise row/
  );
});

test('buildImportPreview normalizes blank identifiers and uses the default review reason when none is provided', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        id: '',
        externalId: '   ',
        item: '   ',
        description: '   ',
        importAction: 'review',
      }),
    ] as never,
    existingKeys: new Set(),
    categories: [],
    subCategories: [],
    budgets: [],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: false,
    canEditBudgets: false,
  });

  assert.equal(rows[0].externalId, undefined);
  assert.equal(rows[0].item, null);
  assert.equal(rows[0].description, null);
  assert.equal(rows[0].duplicate, false);
  assert.match(
    rows[0].warnings.join('\n'),
    /Needs project review: Rule matched/
  );
});

test('buildImportPreview resolves provided project taxonomy and flags duplicate rows within the same import', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        id: 'row_1',
        externalId: 'EXT-DUPE',
        category: 'Travel',
        subcategory: 'Flights',
      }) as never,
      importTxn({
        id: 'row_2',
        externalId: 'EXT-DUPE',
        category: 'Travel',
        subcategory: 'Flights',
      }) as never,
    ],
    existingKeys: new Set(),
    categories: [category],
    subCategories: [subCategory],
    budgets: [],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: false,
    canEditBudgets: false,
  });

  assert.equal(rows[0].mappingStatus, 'source_taxonomy');
  assert.equal(rows[0].categoryId, category.id);
  assert.equal(rows[0].subCategoryId, subCategory.id);
  assert.equal(rows[0].duplicateReason, undefined);

  assert.equal(rows[1].duplicateReason, 'import');
  assert.match(
    rows[1].warnings.join('\n'),
    /Duplicates another row in this import/
  );
});

test('buildImportPreview warns when a source subcategory is provided without a resolvable category', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        category: '',
        subcategory: 'Flights',
      }) as never,
    ],
    existingKeys: new Set(),
    categories: [category],
    subCategories: [subCategory],
    budgets: [],
    projectAutoCodingRules: [rule],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: false,
    canEditBudgets: false,
  });

  assert.equal(rows[0].mappingStatus, 'uncoded');
  assert.match(
    rows[0].warnings.join('\n'),
    /provided without a project category that could be resolved/
  );
  assert.match(rows[0].warnings.join('\n'), /left for manual review/);
});

test('buildImportPreview warns when a source subcategory does not exist under a resolved category', () => {
  const rows = buildImportPreview({
    importTxns: [
      importTxn({
        category: 'Travel',
        subcategory: 'Hotels',
      }) as never,
    ],
    existingKeys: new Set(),
    categories: [category],
    subCategories: [subCategory],
    budgets: [],
    projectAutoCodingRules: [rule],
    autoCreateTaxonomy: false,
    canEditTaxonomy: false,
    autoCreateBudgets: false,
    canEditBudgets: false,
  });

  assert.equal(rows[0].mappingStatus, 'uncoded');
  assert.match(rows[0].warnings.join('\n'), /does not exist under "Travel"/);
  assert.match(rows[0].warnings.join('\n'), /left for manual review/);
});
