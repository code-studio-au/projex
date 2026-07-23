import assert from 'node:assert/strict';
import { test } from 'vitest';

import { planProjectStandardReconciliation } from '../src/server/sync/projectStandards';

type Source = { id: string; fingerprint: string };
type ProjectItem = {
  id: string;
  originId: string | null;
  status: 'local' | 'inherited' | 'overridden' | 'detached';
  fingerprint: string;
};

test('shared inheritance planner applies the complete standard lifecycle deterministically', () => {
  const sourceOne = { id: 'company-1', fingerprint: 'one-v2' };
  const sourceTwo = { id: 'company-2', fingerprint: 'two' };
  const sourceThree = { id: 'company-3', fingerprint: 'three' };
  const inherited = {
    id: 'project-inherited',
    originId: 'company-1',
    status: 'inherited' as const,
    fingerprint: 'one-v1',
  };
  const exactLocal = {
    id: 'project-local',
    originId: null,
    status: 'local' as const,
    fingerprint: 'two',
  };
  const overridden = {
    id: 'project-overridden',
    originId: 'company-3',
    status: 'overridden' as const,
    fingerprint: 'custom-three',
  };
  const stale = {
    id: 'project-stale',
    originId: 'company-removed',
    status: 'inherited' as const,
    fingerprint: 'removed',
  };

  const actions = planProjectStandardReconciliation<Source, ProjectItem>({
    sources: [sourceOne, sourceTwo, sourceThree],
    projectItems: [inherited, exactLocal, overridden, stale],
    sourceId: (source) => source.id,
    originCompanyItemId: (item) => item.originId,
    syncStatus: (item) => item.status,
    isExactLocalDuplicate: (source, item) =>
      source.fingerprint === item.fingerprint,
  });

  assert.deepEqual(
    actions.map((action) => ({
      kind: action.kind,
      sourceId: 'source' in action ? action.source.id : undefined,
      targetId: 'target' in action ? action.target.id : undefined,
    })),
    [
      {
        kind: 'update',
        sourceId: 'company-1',
        targetId: 'project-inherited',
      },
      {
        kind: 'adopt',
        sourceId: 'company-2',
        targetId: 'project-local',
      },
      {
        kind: 'preserve',
        sourceId: 'company-3',
        targetId: 'project-overridden',
      },
      {
        kind: 'detach',
        sourceId: undefined,
        targetId: 'project-stale',
      },
    ]
  );
});

test('shared inheritance planner creates missing sources and is stable after reconciliation', () => {
  const actions = planProjectStandardReconciliation({
    sources: [{ id: 'company-1', fingerprint: 'one' }],
    projectItems: [] as ProjectItem[],
    sourceId: (source) => source.id,
    originCompanyItemId: (item) => item.originId,
    syncStatus: (item) => item.status,
    isExactLocalDuplicate: (source, item) =>
      source.fingerprint === item.fingerprint,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.kind, 'create');

  const rerun = planProjectStandardReconciliation({
    sources: [{ id: 'company-1', fingerprint: 'one' }],
    projectItems: [
      {
        id: 'project-1',
        originId: 'company-1',
        status: 'inherited' as const,
        fingerprint: 'one',
      },
    ],
    sourceId: (source) => source.id,
    originCompanyItemId: (item) => item.originId,
    syncStatus: (item) => item.status,
    isExactLocalDuplicate: (source, item) =>
      source.fingerprint === item.fingerprint,
  });
  assert.equal(rerun.length, 1);
  assert.equal(rerun[0]?.kind, 'update');
});
