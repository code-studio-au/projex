import test from 'node:test';
import assert from 'node:assert/strict';

import { requireServerUserId } from '../src/server/fns/runtime.ts';

test('requireServerUserId trusts request-validated sessions', async () => {
  const userId = await requireServerUserId({
    session: { userId: 'u_verified' as never },
    sessionVerified: true,
  });

  assert.equal(userId, 'u_verified');
});
