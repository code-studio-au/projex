import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { asUserId } from '../src/types/index.ts';

const resolveVerifiedCurrentSessionMock = vi.fn();
const executeTakeFirstMock = vi.fn();
const whereMock = vi.fn(() => ({ executeTakeFirst: executeTakeFirstMock }));
const selectMock = vi.fn(() => ({ where: whereMock }));
const selectFromMock = vi.fn(() => ({ select: selectMock }));
const getDbMock = vi.fn(() => ({ selectFrom: selectFromMock }));

vi.mock('../src/server/auth/currentSession.ts', () => ({
  resolveVerifiedCurrentSession: resolveVerifiedCurrentSessionMock,
}));

vi.mock('../src/server/db/db.ts', () => ({
  getDb: getDbMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

test('requireServerUserId validates auth-derived sessions against the users table', async () => {
  executeTakeFirstMock.mockResolvedValue({
    id: asUserId('usr_auth'),
    disabled: false,
  });

  const { requireServerUserId } = await import('../src/server/fns/runtime.ts');
  const userId = await requireServerUserId({
    auth: { user: { id: 'usr_auth' } },
  });

  assert.equal(userId, 'usr_auth');
  assert.equal(selectFromMock.mock.calls.length, 1);
});

test('requireServerUserId rejects auth-derived sessions when the user record is missing', async () => {
  executeTakeFirstMock.mockResolvedValue(undefined);

  const { requireServerUserId } = await import('../src/server/fns/runtime.ts');

  await assert.rejects(
    () =>
      requireServerUserId({
        auth: { userId: 'usr_missing' },
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'UNAUTHENTICATED');
      assert.equal(error.message, 'Not authenticated');
      return true;
    }
  );
});

test('requireServerUserId rejects disabled auth-derived users', async () => {
  executeTakeFirstMock.mockResolvedValue({
    id: asUserId('usr_disabled'),
    disabled: true,
  });

  const { requireServerUserId } = await import('../src/server/fns/runtime.ts');

  await assert.rejects(
    () =>
      requireServerUserId({
        auth: { userId: 'usr_disabled' },
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'FORBIDDEN');
      assert.equal(error.message, 'User is disabled');
      return true;
    }
  );
});

test('requireServerUserId trusts verified request sessions without a second users-table lookup', async () => {
  resolveVerifiedCurrentSessionMock.mockResolvedValue({
    session: { userId: asUserId('usr_verified') },
    sessionVerified: true,
  });

  const { requireServerUserId } = await import('../src/server/fns/runtime.ts');
  const userId = await requireServerUserId({
    request: new Request('http://localhost:3000/api/test'),
  });

  assert.equal(userId, 'usr_verified');
  assert.equal(getDbMock.mock.calls.length, 0);
});

test('withServerBoundary preserves app errors and normalizes unknown errors', async () => {
  const { withServerBoundary } = await import('../src/server/fns/runtime.ts');

  await assert.rejects(
    () =>
      withServerBoundary(async () => {
        throw new AppError('FORBIDDEN', 'Forbidden');
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'FORBIDDEN');
      assert.equal(error.message, 'Forbidden');
      return true;
    }
  );

  await assert.rejects(
    () =>
      withServerBoundary(async () => {
        throw new Error('boom');
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, 'boom');
      return true;
    }
  );
});

test('assertContextProvided rejects missing context with an unauthenticated app error', async () => {
  const { assertContextProvided } =
    await import('../src/server/fns/runtime.ts');

  assert.throws(
    () => assertContextProvided(undefined),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'UNAUTHENTICATED');
      assert.equal(error.message, 'Missing server auth context');
      return true;
    }
  );
});
