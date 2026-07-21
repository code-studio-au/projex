import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  canMoveImportRule,
  importRuleDraftIsDirty,
  nextImportRuleSortOrder,
  toImportRuleAction,
  toImportRuleField,
  toImportRuleOperator,
} from '../src/components/importRuleEditorModel.ts';
import type { ImportRule } from '../src/types/index.ts';

function rule(args: {
  id: string;
  sortOrder: number;
  syncStatus?: ImportRule['syncStatus'];
}): ImportRule {
  return {
    id: args.id as ImportRule['id'],
    companyId: 'co_1' as ImportRule['companyId'],
    scope: 'project',
    projectId: 'prj_1' as NonNullable<ImportRule['projectId']>,
    name: args.id,
    action: 'exclude',
    field: 'source',
    operator: 'equals',
    value: 'EXA',
    enabled: true,
    sortOrder: args.sortOrder,
    originScope: 'project',
    syncStatus: args.syncStatus ?? 'local',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('import rule editor model parses supported option values', () => {
  assert.equal(toImportRuleAction('review'), 'review');
  assert.equal(toImportRuleField('referenceNum'), 'referenceNum');
  assert.equal(toImportRuleOperator('contains_any'), 'contains_any');
  assert.equal(toImportRuleAction('unsupported'), null);
});

test('import rule editor model preserves project provenance ordering groups', () => {
  const rules = [
    rule({ id: 'one', sortOrder: 10, syncStatus: 'inherited' }),
    rule({ id: 'two', sortOrder: 20, syncStatus: 'overridden' }),
  ];
  assert.equal(
    canMoveImportRule({ rules, index: 0, direction: 1, scope: 'project' }),
    false
  );
  assert.equal(
    canMoveImportRule({ rules, index: 0, direction: 1, scope: 'company' }),
    true
  );
  assert.equal(nextImportRuleSortOrder(rules), 30);
  assert.equal(importRuleDraftIsDirty(rules[0]!, { ...rules[0]! }), false);
  assert.equal(
    importRuleDraftIsDirty(rules[0]!, { ...rules[0]!, enabled: false }),
    true
  );
});
