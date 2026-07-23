import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { asCompanyId, asUserId } from '../src/types/index.ts';

type UpdateLog = {
  table: string;
  values: Record<string, unknown>;
  wheres: Array<readonly unknown[]>;
};

type DeleteLog = {
  table: string;
  wheres: Array<readonly unknown[]>;
};

let currentDb: ReturnType<typeof createMockDb>;
const deleteCompanyExportObjectMock = vi.fn();
const getDbMock = vi.fn(() => currentDb);
const isGlobalSuperadminUserMock = vi.fn(async () => true);
const assertContextProvidedMock = vi.fn();
const requireServerUserIdMock = vi.fn(async () => 'usr_admin');

vi.mock('../src/server/db/db.ts', () => ({
  getDb: getDbMock,
}));

vi.mock('../src/server/auth/globalSuperadmin.ts', () => ({
  isGlobalSuperadminUser: isGlobalSuperadminUserMock,
}));

vi.mock('../src/server/storage/exportObjectStore.ts', () => ({
  deleteCompanyExportObject: deleteCompanyExportObjectMock,
}));

vi.mock('../src/server/fns/runtime.ts', () => ({
  assertContextProvided: assertContextProvidedMock,
  requireServerUserId: requireServerUserIdMock,
  withServerBoundary: (fn: () => Promise<unknown>) => fn(),
}));

function createWhereChain<T>(
  run: () => Promise<T>,
  wheres: Array<readonly unknown[]> = []
) {
  const chain = {
    where: (...args: readonly unknown[]) => {
      wheres.push(args);
      return chain;
    },
    execute: run,
    executeTakeFirst: run,
    distinct: () => chain,
    innerJoin: () => chain,
    select: () => chain,
  };
  return chain;
}

function createUpdateChain(entry: UpdateLog) {
  const chain = {
    where: (...args: readonly unknown[]) => {
      entry.wheres.push(args);
      return chain;
    },
    execute: async () => {},
  };
  return chain;
}

function createDeleteChain(entry: DeleteLog) {
  const chain = {
    where: (...args: readonly unknown[]) => {
      entry.wheres.push(args);
      return chain;
    },
    execute: async () => {},
  };
  return chain;
}

function createMockDb(options: {
  company: { id: string; status: string; name?: string } | undefined;
  memberRows?: Array<{
    user_id: string;
    disabled?: boolean;
    disabled_reason?: string | null;
    is_global_superadmin?: boolean;
  }>;
  otherActiveMembershipRows?: Array<{ user_id: string }>;
  reactivateMemberRows?: Array<{
    user_id: string;
    disabled_reason: string | null;
  }>;
  exportObjects?: Array<{
    storage_bucket: string | null;
    storage_key: string | null;
  }>;
  affectedUserIds?: string[];
}) {
  const updateLogs: UpdateLog[] = [];
  const deleteLogs: DeleteLog[] = [];

  const trx = {
    insertInto() {
      return {
        values: () => ({ execute: async () => {} }),
      };
    },
    updateTable(table: string) {
      return {
        set(values: Record<string, unknown>) {
          const entry: UpdateLog = { table, values, wheres: [] };
          updateLogs.push(entry);
          return createUpdateChain(entry);
        },
      };
    },
    selectFrom(table: string) {
      if (table === 'company_memberships') {
        return {
          select: () =>
            createWhereChain(async () =>
              (options.affectedUserIds ?? []).map((user_id) => ({ user_id }))
            ),
        };
      }

      if (table === 'company_memberships as memberships') {
        const joinedTables: string[] = [];
        const chain = {
          innerJoin: (joinedTable: string) => {
            joinedTables.push(joinedTable);
            return chain;
          },
          select: () =>
            createWhereChain(async () => {
              if (joinedTables.includes('companies')) {
                return options.otherActiveMembershipRows;
              }
              if (options.reactivateMemberRows) {
                return options.reactivateMemberRows;
              }
              return options.memberRows ?? [];
            }),
        };
        return chain;
      }

      throw new Error(`Unexpected trx.selectFrom(${table})`);
    },
    deleteFrom(table: string) {
      const entry: DeleteLog = { table, wheres: [] };
      deleteLogs.push(entry);
      return createDeleteChain(entry);
    },
  };

  return {
    updateLogs,
    deleteLogs,
    selectFrom(table: string) {
      if (table === 'companies') {
        return {
          select: () =>
            createWhereChain(async () =>
              options.company
                ? {
                    id: options.company.id,
                    status: options.company.status,
                    name: options.company.name ?? 'Example Co',
                  }
                : undefined
            ),
        };
      }

      if (table === 'company_export_jobs') {
        return {
          select: () =>
            createWhereChain(async () => options.exportObjects ?? []),
        };
      }

      throw new Error(`Unexpected db.selectFrom(${table})`);
    },
    transaction() {
      return {
        execute: async <T>(callback: (trxArg: typeof trx) => Promise<T>) =>
          callback(trx),
      };
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

test('deactivateCompanyServer archives projects and disables only eligible members', async () => {
  currentDb = createMockDb({
    company: { id: 'co_1', status: 'active' },
    memberRows: [
      {
        user_id: 'usr_disable',
        disabled: false,
        disabled_reason: null,
        is_global_superadmin: false,
      },
      {
        user_id: 'usr_other_company',
        disabled: false,
        disabled_reason: null,
        is_global_superadmin: false,
      },
      {
        user_id: 'usr_superadmin',
        disabled: false,
        disabled_reason: null,
        is_global_superadmin: true,
      },
      {
        user_id: 'usr_keep_disabled',
        disabled: true,
        disabled_reason: 'manual',
        is_global_superadmin: false,
      },
    ],
    otherActiveMembershipRows: [{ user_id: 'usr_other_company' }],
  });

  const { deactivateCompanyServer } =
    await import('../src/server/fns/companyStateTransitions.ts');

  await deactivateCompanyServer({
    context: { session: { userId: asUserId('usr_admin') } },
    companyId: asCompanyId('co_1'),
  });

  assert.equal(currentDb.updateLogs.length, 3);
  assert.equal(currentDb.updateLogs[0].table, 'companies');
  assert.equal(currentDb.updateLogs[0].values.status, 'deactivated');
  assert.equal(currentDb.updateLogs[1].table, 'projects');
  assert.equal(currentDb.updateLogs[1].values.status, 'archived');
  assert.equal(currentDb.updateLogs[2].table, 'users');
  assert.deepEqual(currentDb.updateLogs[2].wheres[0], [
    'id',
    'in',
    ['usr_disable'],
  ]);
});

test('reactivateCompanyServer only re-enables users disabled by company deactivation', async () => {
  currentDb = createMockDb({
    company: { id: 'co_1', status: 'deactivated' },
    reactivateMemberRows: [
      { user_id: 'usr_reenable', disabled_reason: 'company_deactivated' },
      { user_id: 'usr_manual', disabled_reason: 'manual' },
    ],
  });

  const { reactivateCompanyServer } =
    await import('../src/server/fns/companyStateTransitions.ts');

  await reactivateCompanyServer({
    context: { session: { userId: asUserId('usr_admin') } },
    companyId: asCompanyId('co_1'),
  });

  assert.equal(currentDb.updateLogs.length, 3);
  assert.equal(currentDb.updateLogs[0].values.status, 'active');
  assert.equal(currentDb.updateLogs[1].values.status, 'active');
  assert.deepEqual(currentDb.updateLogs[2].wheres[0], [
    'id',
    'in',
    ['usr_reenable'],
  ]);
});

test('deleteCompanyServer rejects incorrect confirmation text', async () => {
  currentDb = createMockDb({
    company: { id: 'co_1', status: 'deactivated', name: 'Example Co' },
  });

  const { deleteCompanyServer } =
    await import('../src/server/fns/companyStateTransitions.ts');

  await assert.rejects(
    () =>
      deleteCompanyServer({
        context: { session: { userId: asUserId('usr_admin') } },
        companyId: asCompanyId('co_1'),
        confirmation: 'DELETE Something Else',
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.match(error.message, /Confirmation text/);
      return true;
    }
  );
});

test('deleteCompanyServer removes stored export objects before deleting company rows', async () => {
  currentDb = createMockDb({
    company: { id: 'co_1', status: 'deactivated', name: 'Example Co' },
    exportObjects: [
      { storage_bucket: 'exports', storage_key: 'co_1/job_1.xlsx' },
      { storage_bucket: 'exports', storage_key: 'co_1/job_2.xlsx' },
    ],
    affectedUserIds: ['usr_1', 'usr_2'],
  });

  const { deleteCompanyServer } =
    await import('../src/server/fns/companyStateTransitions.ts');

  await deleteCompanyServer({
    context: { session: { userId: asUserId('usr_admin') } },
    companyId: asCompanyId('co_1'),
    confirmation: 'DELETE Example Co',
  });

  assert.equal(deleteCompanyExportObjectMock.mock.calls.length, 2);
  assert.deepEqual(deleteCompanyExportObjectMock.mock.calls[0][0], {
    bucket: 'exports',
    key: 'co_1/job_1.xlsx',
  });
  assert.equal(currentDb.deleteLogs[0].table, 'companies');
  assert.equal(currentDb.deleteLogs[1].table, 'users');
});
