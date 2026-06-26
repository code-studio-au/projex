import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  emailSchema,
  txnCommentBodySchema,
  userNameSchema,
} from '../src/validation/schemas.ts';

test('schema helpers reject blank, overlong, and invalid email values', () => {
  assert.equal(userNameSchema.safeParse('   ').success, false);
  assert.equal(userNameSchema.safeParse('x'.repeat(121)).success, false);
  assert.equal(txnCommentBodySchema.safeParse('x'.repeat(2001)).success, false);
  assert.equal(emailSchema.safeParse('not-an-email').success, false);
  assert.equal(emailSchema.safeParse(' user@example.com ').success, true);
});
