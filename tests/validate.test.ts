import assert from 'node:assert/strict';
import { test } from 'vitest';
import { z } from 'zod';

import { AppError } from '../src/api/errors.ts';
import { validateOrThrow } from '../src/validation/validate.ts';

test('validateOrThrow returns parsed values and surfaces schema messages', () => {
  assert.equal(validateOrThrow(z.string().min(2), 'ok'), 'ok');

  assert.throws(
    () => validateOrThrow(z.string().min(2, 'Too short'), 'x'),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.message, 'Too short');
      return true;
    }
  );
});

test('validateOrThrow falls back to a generic message when no issues are present', () => {
  const schema = {
    safeParse() {
      return {
        success: false as const,
        error: { issues: [] },
      };
    },
  } as unknown as z.ZodType<string>;

  assert.throws(
    () => validateOrThrow(schema, 'value'),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.message, 'Validation failed');
      return true;
    }
  );
});
