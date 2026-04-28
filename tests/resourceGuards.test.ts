import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../src/api/errors.ts';
import { readJsonBody } from '../src/routes/-api-shared.ts';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireCompanyMember,
} from '../src/server/fns/resourceGuards.ts';
import {
  asCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asUserId,
} from '../src/types/index.ts';
import {
  budgetAllocatedCentsSchema,
  projectBudgetTotalCentsSchema,
  txnInputSchema,
} from '../src/validation/schemas.ts';

type TableName =
  | 'categories'
  | 'company_default_mapping_rules'
  | 'company_memberships'
  | 'sub_categories';

type Row = Record<string, unknown>;

function createFakeDb(tables: Partial<Record<TableName, Row[]>>) {
  return {
    selectFrom(tableName: TableName) {
      const filters: Array<{ column: string; value: unknown }> = [];
      return {
        select() {
          return this;
        },
        where(column: string, _operator: string, value: unknown) {
          filters.push({ column, value });
          return this;
        },
        async executeTakeFirst() {
          return (tables[tableName] ?? []).find((row) =>
            filters.every((filter) => row[filter.column] === filter.value)
          );
        },
      };
    },
  };
}

async function assertAppError(
  run: () => Promise<unknown>,
  code: AppError['code'],
  message: string
) {
  await assert.rejects(run, (error) => {
    assert.equal(error instanceof AppError, true);
    assert.equal((error as AppError).code, code);
    assert.equal((error as AppError).message, message);
    return true;
  });
}

test('readJsonBody converts malformed JSON into validation errors', async () => {
  await assertAppError(
    () =>
      readJsonBody(
        new Request('http://localhost/api/example', {
          method: 'POST',
          body: '{bad json',
        })
      ),
    'VALIDATION_ERROR',
    'Request body must be valid JSON'
  );
});

test('requireCompanyMember enforces company membership before project membership', async () => {
  const db = createFakeDb({
    company_memberships: [{ company_id: 'co_1', user_id: 'usr_1' }],
  });

  await requireCompanyMember({
    db: db as never,
    companyId: asCompanyId('co_1'),
    userId: asUserId('usr_1'),
  });

  await assertAppError(
    () =>
      requireCompanyMember({
        db: db as never,
        companyId: asCompanyId('co_1'),
        userId: asUserId('usr_2'),
      }),
    'VALIDATION_ERROR',
    'User must be a company member before being added to a project'
  );
});

test('resource guards reject child resources outside the requested parent', async () => {
  const db = createFakeDb({
    categories: [{ id: 'cat_1', project_id: 'prj_1' }],
    sub_categories: [
      { id: 'sub_1', project_id: 'prj_1', category_id: 'cat_1' },
    ],
    company_default_mapping_rules: [{ id: 'rule_1', company_id: 'co_1' }],
  });

  await assertCategoryInProject({
    db: db as never,
    projectId: asProjectId('prj_1'),
    categoryId: asCategoryId('cat_1'),
  });
  await assertSubCategoryInProject({
    db: db as never,
    projectId: asProjectId('prj_1'),
    subCategoryId: asSubCategoryId('sub_1'),
    categoryId: asCategoryId('cat_1'),
  });
  await assertCompanyDefaultMappingRuleInCompany({
    db: db as never,
    companyId: asCompanyId('co_1'),
    ruleId: asCompanyDefaultMappingRuleId('rule_1'),
  });

  await assertAppError(
    () =>
      assertCategoryInProject({
        db: db as never,
        projectId: asProjectId('prj_2'),
        categoryId: asCategoryId('cat_1'),
      }),
    'NOT_FOUND',
    'Unknown category'
  );
  await assertAppError(
    () =>
      assertSubCategoryInProject({
        db: db as never,
        projectId: asProjectId('prj_1'),
        subCategoryId: asSubCategoryId('sub_1'),
        categoryId: asCategoryId('cat_2'),
      }),
    'VALIDATION_ERROR',
    'Subcategory does not belong to category'
  );
  await assertAppError(
    () =>
      assertCompanyDefaultMappingRuleInCompany({
        db: db as never,
        companyId: asCompanyId('co_2'),
        ruleId: asCompanyDefaultMappingRuleId('rule_1'),
      }),
    'NOT_FOUND',
    'Unknown company default mapping rule'
  );
});

test('money inputs reject values outside JavaScript safe integer bounds', () => {
  const unsafeAmount = Number.MAX_SAFE_INTEGER + 1;

  assert.equal(
    txnInputSchema.safeParse({
      date: '2026-04-28',
      item: 'Flight',
      description: 'Sydney to Melbourne',
      amountCents: unsafeAmount,
    }).success,
    false
  );
  assert.equal(
    budgetAllocatedCentsSchema.safeParse(unsafeAmount).success,
    false
  );
  assert.equal(
    projectBudgetTotalCentsSchema.safeParse(unsafeAmount).success,
    false
  );
});
