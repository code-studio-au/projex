import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { asCompanyId, asProjectId, asUserId } from '../src/types/index.ts';

const isGlobalSuperadminUserMock = vi.fn();

vi.mock('../src/server/auth/globalSuperadmin.ts', () => ({
  isGlobalSuperadminUser: isGlobalSuperadminUserMock,
}));

function createListChain<T>(rows: T[]) {
  const chain = {
    where: () => chain,
    select: () => chain,
    execute: async () => rows,
    executeTakeFirst: async () => rows[0],
  };
  return chain;
}

function createAuthorizeDb(options: {
  companyRows?: Array<{
    company_id: string;
    user_id: string;
    role: 'admin' | 'executive' | 'management' | 'member';
  }>;
  projectRows?: Array<{
    project_id: string;
    user_id: string;
    role: 'owner' | 'lead' | 'member' | 'viewer';
  }>;
  projectAllowSuperadminAccess?: boolean;
}) {
  return {
    selectFrom(table: string) {
      if (table === 'company_memberships') {
        return createListChain(options.companyRows ?? []);
      }
      if (table === 'project_memberships') {
        return createListChain(options.projectRows ?? []);
      }
      if (table === 'projects') {
        return {
          select: () =>
            createListChain([
              {
                allow_superadmin_access:
                  options.projectAllowSuperadminAccess ?? true,
              },
            ]),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

test('isAuthorized allows company export for an executive company member', async () => {
  isGlobalSuperadminUserMock.mockResolvedValue(false);
  const db = createAuthorizeDb({
    companyRows: [
      {
        company_id: 'co_1',
        user_id: 'usr_1',
        role: 'executive',
      },
    ],
  });

  const { isAuthorized } = await import('../src/server/auth/authorize.ts');
  const allowed = await isAuthorized({
    db: db as never,
    userId: asUserId('usr_1'),
    action: 'company:export',
    companyId: asCompanyId('co_1'),
  });

  assert.equal(allowed, true);
});

test('isAuthorized blocks superadmin access when the project disables superadmin access', async () => {
  isGlobalSuperadminUserMock.mockResolvedValue(true);
  const db = createAuthorizeDb({
    projectAllowSuperadminAccess: false,
  });

  const { isAuthorized } = await import('../src/server/auth/authorize.ts');
  const allowed = await isAuthorized({
    db: db as never,
    userId: asUserId('usr_super'),
    action: 'project:view',
    companyId: asCompanyId('co_1'),
    projectId: asProjectId('prj_1'),
  });

  assert.equal(allowed, false);
});

test('isAuthorized allows superadmin project access when the project permits it', async () => {
  isGlobalSuperadminUserMock.mockResolvedValue(true);
  const db = createAuthorizeDb({
    projectAllowSuperadminAccess: true,
  });

  const { isAuthorized } = await import('../src/server/auth/authorize.ts');
  const allowed = await isAuthorized({
    db: db as never,
    userId: asUserId('usr_super'),
    action: 'project:view',
    companyId: asCompanyId('co_1'),
    projectId: asProjectId('prj_1'),
  });

  assert.equal(allowed, true);
});

test('requireAuthorized throws a forbidden app error when authorization fails', async () => {
  isGlobalSuperadminUserMock.mockResolvedValue(false);
  const db = createAuthorizeDb({
    companyRows: [],
    projectRows: [],
  });

  const { requireAuthorized } = await import('../src/server/auth/authorize.ts');

  await assert.rejects(
    () =>
      requireAuthorized({
        db: db as never,
        userId: asUserId('usr_1'),
        action: 'company:export',
        companyId: asCompanyId('co_1'),
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'FORBIDDEN');
      assert.equal(error.message, 'Forbidden');
      return true;
    }
  );
});
