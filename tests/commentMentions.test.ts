import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  activeMentionFromSelection,
  filterMentionUsers,
  insertMention,
  mentionUserLabel,
} from '../src/utils/commentMentions.ts';
import { asUserId } from '../src/types/index.ts';

const users = [
  { id: asUserId('usr_1'), name: 'Steven Castle', email: 'steven@example.com' },
  { id: asUserId('usr_2'), name: 'Maria Lee', email: 'maria@example.com' },
  { id: asUserId('usr_3'), name: '', email: 'finance@example.com' },
];

test('comment mention detection tracks active @ query at cursor', () => {
  assert.deepEqual(activeMentionFromSelection('Please ask @Ste', 15), {
    start: 11,
    end: 15,
    query: 'Ste',
  });
  assert.deepEqual(activeMentionFromSelection('Please ask @', 12), {
    start: 11,
    end: 12,
    query: '',
  });
  assert.equal(activeMentionFromSelection('email@example.com', 17), null);
  assert.equal(
    activeMentionFromSelection('Please ask @Steven today', 25),
    null
  );
});

test('comment mention users filter by project member name or email', () => {
  assert.deepEqual(
    filterMentionUsers(users, 'ste').map((user) => user.id),
    [asUserId('usr_1')]
  );
  assert.deepEqual(
    filterMentionUsers(users, 'finance').map((user) => user.id),
    [asUserId('usr_3')]
  );
  assert.deepEqual(
    filterMentionUsers(users, '').map((user) => user.id),
    [asUserId('usr_1'), asUserId('usr_2'), asUserId('usr_3')]
  );
  assert.deepEqual(
    filterMentionUsers(users, 'e', 2).map((user) => user.id),
    [asUserId('usr_1'), asUserId('usr_2')]
  );
});

test('comment mention insertion replaces the active token and returns cursor', () => {
  const range = activeMentionFromSelection('Please ask @Ste about this', 15);
  assert.ok(range);

  assert.deepEqual(
    insertMention('Please ask @Ste about this', range, 'Steven Castle'),
    {
      value: 'Please ask @Steven Castle about this',
      cursor: 26,
    }
  );
  assert.equal(
    mentionUserLabel({ name: '', email: 'finance@example.com' }),
    'finance@example.com'
  );
  assert.equal(
    mentionUserLabel({ name: 'Steven Castle', email: 'steven@example.com' }),
    'Steven Castle'
  );
  const spacedRange = activeMentionFromSelection('Hello @Ste world', 10);
  assert.ok(spacedRange);
  assert.deepEqual(
    insertMention('Hello @Ste world', spacedRange, 'Steven Castle'),
    {
      value: 'Hello @Steven Castle world',
      cursor: 21,
    }
  );
  const punctuationRange = activeMentionFromSelection('Thanks @Ste,', 11);
  assert.ok(punctuationRange);
  assert.deepEqual(
    insertMention('Thanks @Ste,', punctuationRange, 'Steven Castle'),
    {
      value: 'Thanks @Steven Castle ,',
      cursor: 22,
    }
  );
});
