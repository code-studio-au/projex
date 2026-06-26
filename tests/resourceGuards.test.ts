import assert from 'node:assert/strict';
import { test } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { readJsonBody } from '../src/routes/-api-shared.ts';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireOperationalProjectForAction,
  requireProjectForAction,
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
  deleteCompanyBodySchema,
  deleteCompanyMembershipQuerySchema,
  deleteProjectBodySchema,
  deleteProjectMembershipQuerySchema,
  txnCommentMutationBodySchema,
  txnCommentUpdateMutationBodySchema,
  txnWorkflowStateMutationBodySchema,
  updateProjectBodySchema,
} from '../src/validation/apiSchemas.ts';
import { projectResponseSchema } from '../src/validation/responseSchemas.ts';
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
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
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

test('membership delete query schemas validate ids and roles', () => {
  assert.equal(
    deleteCompanyMembershipQuerySchema.safeParse({ userId: 'usr_1' }).success,
    true
  );
  assert.equal(deleteCompanyMembershipQuerySchema.safeParse({}).success, false);

  assert.equal(
    deleteProjectMembershipQuerySchema.safeParse({
      userId: 'usr_1',
      role: 'viewer',
    }).success,
    true
  );
  assert.equal(
    deleteProjectMembershipQuerySchema.safeParse({
      userId: 'usr_1',
      role: 'admin',
    }).success,
    false
  );
  assert.equal(
    deleteProjectMembershipQuerySchema.safeParse({ userId: 'usr_1' }).success,
    false
  );
});

test('destructive delete body schemas require confirmation text', () => {
  assert.equal(
    deleteCompanyBodySchema.safeParse({ confirmation: 'DELETE Acme' }).success,
    true
  );
  assert.equal(
    deleteCompanyBodySchema.safeParse({ confirmation: '   ' }).success,
    false
  );
  assert.equal(deleteCompanyBodySchema.safeParse({}).success, false);

  assert.equal(
    deleteProjectBodySchema.safeParse({ confirmation: 'DELETE Buildout' })
      .success,
    true
  );
  assert.equal(
    deleteProjectBodySchema.safeParse({ confirmation: '' }).success,
    false
  );
});

test('project schemas include transaction transfer capability', () => {
  assert.equal(
    updateProjectBodySchema.safeParse({ allowTxnTransfers: false }).success,
    true
  );
  assert.equal(
    updateProjectBodySchema.safeParse({ allowTxnTransfers: 'no' }).success,
    false
  );

  const parsed = projectResponseSchema.parse({
    id: 'prj_1',
    companyId: 'co_1',
    name: 'Buildout',
    projectType: 'project',
    budgetTotalCents: 0,
    currency: 'AUD',
    status: 'active',
    visibility: 'private',
    allowSuperadminAccess: true,
    allowTxnTransfers: false,
  });

  assert.equal(parsed.allowTxnTransfers, false);
});

test('transaction comment schemas require valid body and ids', () => {
  assert.equal(
    txnCommentMutationBodySchema.safeParse({
      comment: {
        txnId: 'txn_1',
        body: 'Please confirm the supplier allocation.',
        assignedToUserId: 'usr_1',
      },
    }).success,
    true
  );
  assert.equal(
    txnCommentMutationBodySchema.safeParse({
      comment: { txnId: 'txn_1', body: '   ' },
    }).success,
    false
  );
  assert.equal(
    txnCommentUpdateMutationBodySchema.safeParse({
      comment: { id: 'txn_comment_1', resolved: true },
    }).success,
    true
  );
  assert.equal(
    txnCommentUpdateMutationBodySchema.safeParse({
      comment: { id: 'txn_comment_1', body: '' },
    }).success,
    false
  );
});

test('transaction workflow schema requires an explicit state change', () => {
  assert.equal(
    txnWorkflowStateMutationBodySchema.safeParse({
      workflow: { txnId: 'txn_1', reviewed: true },
    }).success,
    true
  );
  assert.equal(
    txnWorkflowStateMutationBodySchema.safeParse({
      workflow: { txnId: 'txn_1', locked: false },
    }).success,
    true
  );
  assert.equal(
    txnWorkflowStateMutationBodySchema.safeParse({
      workflow: { txnId: 'txn_1' },
    }).success,
    false
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
        projectId: asProjectId('prj_9'),
        subCategoryId: asSubCategoryId('sub_missing'),
      }),
    'NOT_FOUND',
    'Unknown subcategory'
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

test('requireProjectForAction loads project context and rejects unknown projects', async () => {
  const projectDb = {
    selectFrom(tableName: string) {
      if (tableName === 'projects') {
        return {
          innerJoin() {
            return this;
          },
          select() {
            return this;
          },
          where() {
            return this;
          },
          async executeTakeFirst() {
            return {
              id: 'prj_1',
              company_id: 'co_1',
              project_type: 'project',
              allow_txn_transfers: true,
              project_status: 'active',
              company_status: 'active',
            };
          },
        };
      }
      if (tableName === 'company_memberships') {
        return {
          select() {
            return this;
          },
          where() {
            return this;
          },
          async execute() {
            return [{ company_id: 'co_1', user_id: 'usr_1', role: 'admin' }];
          },
        };
      }
      if (tableName === 'project_memberships') {
        return {
          select() {
            return this;
          },
          where() {
            return this;
          },
          async execute() {
            return [{ project_id: 'prj_1', user_id: 'usr_1', role: 'owner' }];
          },
        };
      }
      if (tableName === 'users') {
        return {
          select() {
            return this;
          },
          where() {
            return this;
          },
          async executeTakeFirst() {
            return { is_global_superadmin: false };
          },
        };
      }
      throw new Error(`Unexpected table: ${tableName}`);
    },
  };

  const result = await requireProjectForAction(
    {
      session: { userId: asUserId('usr_1') },
      sessionVerified: true,
    },
    asProjectId('prj_1'),
    'project:view',
    projectDb as never
  );

  assert.equal(result.userId, 'usr_1');
  assert.equal(result.companyId, 'co_1');
  assert.equal(result.projectType, 'project');
  assert.equal(result.allowTxnTransfers, true);

  const missingProjectDb = {
    selectFrom() {
      return {
        innerJoin() {
          return this;
        },
        select() {
          return this;
        },
        where() {
          return this;
        },
        async executeTakeFirst() {
          return undefined;
        },
      };
    },
  };
  await assertAppError(
    () =>
      requireProjectForAction(
        {
          session: { userId: asUserId('usr_1') },
          sessionVerified: true,
        },
        asProjectId('prj_missing'),
        'project:view',
        missingProjectDb as never
      ),
    'NOT_FOUND',
    'Unknown project'
  );
});

test('requireOperationalProjectForAction enforces active company, active project, and project type', async () => {
  const baseDb = (
    projectStatus: 'active' | 'archived',
    companyStatus: 'active' | 'deactivated',
    projectType: 'project' | 'programme'
  ) => ({
    selectFrom(tableName: string) {
      if (tableName === 'projects') {
        return {
          innerJoin() {
            return this;
          },
          select() {
            return this;
          },
          where() {
            return this;
          },
          async executeTakeFirst() {
            return {
              id: 'prj_1',
              company_id: 'co_1',
              project_type: projectType,
              allow_txn_transfers: false,
              project_status: projectStatus,
              company_status: companyStatus,
            };
          },
          async executeTakeFirstOrThrow() {
            return {
              project_status: projectStatus,
              company_status: companyStatus,
            };
          },
        };
      }
      if (tableName === 'company_memberships') {
        return {
          select() {
            return this;
          },
          where() {
            return this;
          },
          async execute() {
            return [{ company_id: 'co_1', user_id: 'usr_1', role: 'admin' }];
          },
        };
      }
      if (tableName === 'project_memberships') {
        return {
          select() {
            return this;
          },
          where() {
            return this;
          },
          async execute() {
            return [{ project_id: 'prj_1', user_id: 'usr_1', role: 'owner' }];
          },
        };
      }
      if (tableName === 'users') {
        return {
          select() {
            return this;
          },
          where() {
            return this;
          },
          async executeTakeFirst() {
            return { is_global_superadmin: false };
          },
        };
      }
      throw new Error(`Unexpected table: ${tableName}`);
    },
  });

  await assertAppError(
    () =>
      requireOperationalProjectForAction(
        {
          session: { userId: asUserId('usr_1') },
          sessionVerified: true,
        },
        asProjectId('prj_1'),
        'project:view',
        baseDb('active', 'deactivated', 'project') as never
      ),
    'FORBIDDEN',
    'Company is deactivated'
  );

  await assertAppError(
    () =>
      requireOperationalProjectForAction(
        {
          session: { userId: asUserId('usr_1') },
          sessionVerified: true,
        },
        asProjectId('prj_1'),
        'project:view',
        baseDb('archived', 'active', 'project') as never
      ),
    'FORBIDDEN',
    'Project is deactivated'
  );

  await assertAppError(
    () =>
      requireOperationalProjectForAction(
        {
          session: { userId: asUserId('usr_1') },
          sessionVerified: true,
        },
        asProjectId('prj_1'),
        'project:view',
        baseDb('active', 'active', 'programme') as never
      ),
    'VALIDATION_ERROR',
    'Programmes are reporting-only and cannot be used for project operations'
  );

  const operational = await requireOperationalProjectForAction(
    {
      session: { userId: asUserId('usr_1') },
      sessionVerified: true,
    },
    asProjectId('prj_1'),
    'project:view',
    baseDb('active', 'active', 'project') as never
  );
  assert.equal(operational.projectType, 'project');
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
