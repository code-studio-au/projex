import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  parseCompanyDashboardSearch,
  parseProjectWorkspaceSearch,
  parseResetPasswordSearch,
} from '../src/routes/-routeSearchValidation.ts';

test('project workspace search keeps valid fields when another field is invalid', () => {
  assert.deepEqual(
    parseProjectWorkspaceSearch({
      tab: 'transactions',
      year: 'invalid',
      month: '2026-07',
      view: 'needs-review',
      q: 'apiko',
    }),
    {
      tab: 'transactions',
      year: undefined,
      month: '2026-07',
      view: 'needs-review',
      q: 'apiko',
    }
  );
});

test('project workspace search discards incomplete transaction searches', () => {
  assert.deepEqual(parseProjectWorkspaceSearch({ q: 'a' }), {
    q: undefined,
  });
});

test('route search validation trims values and strips unknown fields', () => {
  assert.deepEqual(
    parseProjectWorkspaceSearch({
      q: '  apiko  ',
      categoryId: '  category-1 ',
      ignored: 'value',
    }),
    {
      q: 'apiko',
      categoryId: 'category-1',
    }
  );
});

test('company dashboard search rejects the full search object when a field is invalid', () => {
  assert.deepEqual(
    parseCompanyDashboardSearch({
      tab: 'projects',
      review: 'invalid',
    }),
    {}
  );
});

test('password-link search preserves optional and fallback behaviour', () => {
  assert.deepEqual(
    parseResetPasswordSearch({
      token: '  token-1  ',
      error: null,
      ignored: 'value',
    }),
    {
      token: 'token-1',
      error: '',
    }
  );
});
