import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { safeParseJson } from '../src/utils/json.ts';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('../src/server/auth/betterAuthInstance.ts', () => ({
  getBetterAuthInstance: () => ({
    api: {
      getSession: getSessionMock,
    },
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test('BetterAuth session failures retain request correlation without private exception data', async () => {
  getSessionMock.mockRejectedValue(
    Object.assign(
      new Error('Provider failed with authorization=Bearer private-auth-token'),
      {
        headers: { cookie: 'session=private-cookie' },
        responseBody: 'private provider response',
      }
    )
  );
  const messages: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });

  const { getAuthSessionFromRequest } =
    await import('../src/server/auth/betterAuth.ts');
  const session = await getAuthSessionFromRequest(
    new Request('https://app.example.test/api/session?token=private-query', {
      headers: {
        authorization: 'Bearer private-request-token',
        cookie: 'session=private-request-cookie',
      },
    }),
    'req_auth_failure'
  );

  assert.equal(session, null);
  assert.equal(messages.length, 1);
  const parsed = safeParseJson(messages[0] ?? '');
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data, {
    level: 'error',
    type: 'auth_session_resolution_failed',
    requestId: 'req_auth_failure',
    method: 'GET',
    path: '/api/session',
    errorType: 'Error',
  });
  assert.doesNotMatch(
    messages[0] ?? '',
    /private-auth|private-cookie|private-provider|private-query|private-request/u
  );
});
