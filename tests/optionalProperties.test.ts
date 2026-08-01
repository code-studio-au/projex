import assert from 'node:assert/strict';
import { test } from 'vitest';

import { omitUndefinedProperties } from '../src/utils/optionalProperties.ts';

test('omitUndefinedProperties removes undefined keys without removing other falsey values', () => {
  assert.deepEqual(
    omitUndefinedProperties({
      required: 'value',
      absent: undefined,
      nullable: null,
      disabled: false,
      count: 0,
      empty: '',
    }),
    {
      required: 'value',
      nullable: null,
      disabled: false,
      count: 0,
      empty: '',
    }
  );
});

test('omitUndefinedProperties remains shallow for nested DTO boundaries', () => {
  const nested = { absent: undefined, present: 'value' };

  assert.deepEqual(omitUndefinedProperties({ nested }), { nested });
});
