import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { asUserId } from '../src/types/index.ts';

const getAuthSessionFromRequestMock = vi.fn();
const executeTakeFirstMock = vi.fn();
const whereMock = vi.fn(() => ({ executeTakeFirst: executeTakeFirstMock }));
const selectMock = vi.fn(() => ({ where: whereMock }));
const selectFromMock = vi.fn(() => ({ select: selectMock }));
const getDbMock = vi.fn(() => ({ selectFrom: selectFromMock }));

vi.mock('../src/server/auth/betterAuth.ts', () => ({
  getAuthSessionFromRequest: getAuthSessionFromRequestMock,
}));

vi.mock('../src/server/db/db.ts', () => ({
  getDb: getDbMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

test('resolveVerifiedCurrentSession returns unauthenticated when no auth session is present', async () => {
  getAuthSessionFromRequestMock.mockResolvedValue(null);

  const { resolveVerifiedCurrentSession } =
    await import('../src/server/auth/currentSession.ts');
  const result = await resolveVerifiedCurrentSession(
    new Request('http://localhost:3000/api/session')
  );

  assert.deepEqual(result, {
    session: null,
    sessionVerified: false,
  });
  assert.equal(getDbMock.mock.calls.length, 0);
});

test('resolveVerifiedCurrentSession rejects auth sessions whose users are missing', async () => {
  getAuthSessionFromRequestMock.mockResolvedValue({
    userId: asUserId('usr_missing'),
  });
  executeTakeFirstMock.mockResolvedValue(undefined);

  const { resolveVerifiedCurrentSession } =
    await import('../src/server/auth/currentSession.ts');
  const result = await resolveVerifiedCurrentSession(
    new Request('http://localhost:3000/api/session')
  );

  assert.deepEqual(result, {
    session: null,
    sessionVerified: false,
  });
  assert.equal(selectFromMock.mock.calls.length, 1);
});

test('resolveVerifiedCurrentSession rejects disabled users', async () => {
  getAuthSessionFromRequestMock.mockResolvedValue({
    userId: asUserId('usr_disabled'),
  });
  executeTakeFirstMock.mockResolvedValue({
    id: asUserId('usr_disabled'),
    disabled: true,
  });

  const { resolveVerifiedCurrentSession } =
    await import('../src/server/auth/currentSession.ts');
  const result = await resolveVerifiedCurrentSession(
    new Request('http://localhost:3000/api/session')
  );

  assert.deepEqual(result, {
    session: null,
    sessionVerified: false,
  });
});

test('resolveVerifiedCurrentSession preserves active sessions for enabled users', async () => {
  const session = { userId: asUserId('usr_active') };
  getAuthSessionFromRequestMock.mockResolvedValue(session);
  executeTakeFirstMock.mockResolvedValue({
    id: asUserId('usr_active'),
    disabled: false,
  });

  const { resolveVerifiedCurrentSession } =
    await import('../src/server/auth/currentSession.ts');
  const result = await resolveVerifiedCurrentSession(
    new Request('http://localhost:3000/api/session')
  );

  assert.deepEqual(result, {
    session,
    sessionVerified: true,
  });
  assert.deepEqual(whereMock.mock.calls[0], [
    'id',
    '=',
    asUserId('usr_active'),
  ]);
});

test('resolveCurrentSession unwraps only the session from verified resolution', async () => {
  const session = { userId: asUserId('usr_active') };
  getAuthSessionFromRequestMock.mockResolvedValue(session);
  executeTakeFirstMock.mockResolvedValue({
    id: asUserId('usr_active'),
    disabled: false,
  });

  const { resolveCurrentSession } =
    await import('../src/server/auth/currentSession.ts');
  const result = await resolveCurrentSession(
    new Request('http://localhost:3000/api/session')
  );

  assert.deepEqual(result, session);
});
