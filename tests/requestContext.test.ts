import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { asUserId } from '../src/types/index.ts';

const resolveVerifiedCurrentSessionMock = vi.fn();

vi.mock('../src/server/auth/currentSession.ts', () => ({
  resolveVerifiedCurrentSession: resolveVerifiedCurrentSessionMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

test('resolveRequestServerContext caches resolved session state per request', async () => {
  resolveVerifiedCurrentSessionMock.mockResolvedValue({
    session: { userId: asUserId('usr_1') },
    sessionVerified: true,
  });

  const { resolveRequestServerContext } =
    await import('../src/server/http/requestContext.ts');
  const request = new Request('http://localhost:3000/api/companies');

  const [first, second] = await Promise.all([
    resolveRequestServerContext(request),
    resolveRequestServerContext(request),
  ]);

  assert.equal(resolveVerifiedCurrentSessionMock.mock.calls.length, 1);
  assert.strictEqual(first, second);
  assert.deepEqual(first.session, { userId: asUserId('usr_1') });
  assert.equal(first.serverContext.sessionVerified, true);
  assert.strictEqual(first.serverContext.request, request);
  assert.deepEqual(first.serverContext.session, first.session);
});

test('resolveRequestServerContext keeps request cache scoped to each request object', async () => {
  resolveVerifiedCurrentSessionMock.mockImplementation(
    async (request: Request) => ({
      session: { userId: asUserId(new URL(request.url).pathname.slice(-1)) },
      sessionVerified: false,
    })
  );

  const { resolveRequestServerContext } =
    await import('../src/server/http/requestContext.ts');
  const firstRequest = new Request('http://localhost:3000/api/a');
  const secondRequest = new Request('http://localhost:3000/api/b');

  const first = await resolveRequestServerContext(firstRequest);
  const second = await resolveRequestServerContext(secondRequest);

  assert.equal(resolveVerifiedCurrentSessionMock.mock.calls.length, 2);
  assert.notStrictEqual(first, second);
  assert.equal(first.session?.userId, 'a');
  assert.equal(second.session?.userId, 'b');
  assert.equal(first.serverContext.sessionVerified, false);
  assert.equal(second.serverContext.sessionVerified, false);
});
