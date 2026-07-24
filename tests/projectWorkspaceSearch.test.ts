import assert from 'node:assert/strict';
import { test } from 'vitest';

import { projectWorkspaceSearchSchema } from '../src/routes/-projectWorkspaceSearch.ts';

test('project workspace search keeps valid fields when another field is invalid', () => {
  assert.deepEqual(
    projectWorkspaceSearchSchema.parse({
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
  assert.deepEqual(projectWorkspaceSearchSchema.parse({ q: 'a' }), {
    q: undefined,
  });
});
