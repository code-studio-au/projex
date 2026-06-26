import assert from 'node:assert/strict';
import { test } from 'vitest';
import { z } from 'zod';

import {
  parseJsonOrNull,
  parseJsonOrText,
  parseJsonWithSchema,
  readJsonResponseOrNull,
  readJsonResponseWithSchema,
  safeParseJson,
} from '../src/utils/json.ts';

test('safeParseJson returns parsed JSON or a syntax failure', () => {
  assert.deepEqual(safeParseJson('{"ok":true}'), {
    success: true,
    data: { ok: true },
  });

  const invalid = safeParseJson('{bad json');
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.ok(invalid.error instanceof SyntaxError);
  }
});

test('safeParseJson normalizes non-syntax parse failures into SyntaxError', () => {
  const originalParse = JSON.parse;
  JSON.parse = (() => {
    throw new Error('unexpected');
  }) as typeof JSON.parse;

  try {
    const invalid = safeParseJson('{"ok":true}');
    assert.equal(invalid.success, false);
    if (!invalid.success) {
      assert.ok(invalid.error instanceof SyntaxError);
    }
  } finally {
    JSON.parse = originalParse;
  }
});

test('parseJsonOrNull and parseJsonOrText preserve caller fallback behavior', () => {
  assert.equal(parseJsonOrNull(''), null);
  assert.equal(parseJsonOrNull('not json'), null);
  assert.deepEqual(parseJsonOrNull('{"message":"hello"}'), {
    message: 'hello',
  });

  assert.equal(parseJsonOrText(''), null);
  assert.equal(parseJsonOrText('not json'), 'not json');
  assert.deepEqual(parseJsonOrText('["a","b"]'), ['a', 'b']);
});

test('parseJsonWithSchema validates parsed JSON against a schema', () => {
  const schema = z.object({ count: z.number().int().min(0) });

  assert.deepEqual(parseJsonWithSchema('{"count":2}', schema), {
    success: true,
    data: { count: 2 },
  });
  assert.equal(parseJsonWithSchema('{"count":-1}', schema).success, false);
  assert.equal(parseJsonWithSchema('{bad json', schema).success, false);
});

test('response JSON helpers parse responses without throwing on invalid JSON', async () => {
  assert.deepEqual(await readJsonResponseOrNull(new Response('{"ok":true}')), {
    ok: true,
  });
  assert.equal(await readJsonResponseOrNull(new Response('not json')), null);

  const schema = z.object({ ok: z.literal(true) });
  assert.deepEqual(
    await readJsonResponseWithSchema(new Response('{"ok":true}'), schema),
    { success: true, data: { ok: true } }
  );
  assert.equal(
    (await readJsonResponseWithSchema(new Response('{"ok":false}'), schema))
      .success,
    false
  );
});
