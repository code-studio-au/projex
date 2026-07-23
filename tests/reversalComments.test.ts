import assert from 'node:assert/strict';
import { test } from 'vitest';

import { buildPendingComment } from '../src/server/fns/transactions/reversalComments.ts';

test('pending reversal comments contain only the user note', () => {
  const body = buildPendingComment({
    commentBody: '  Move after finance confirms.  ',
  });
  assert.equal(body, 'Move after finance confirms.');
});
