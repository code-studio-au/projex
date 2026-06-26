import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  clearBudgetCollapseState,
  loadBudgetCollapseState,
  saveBudgetCollapseState,
} from '../src/store/uiPrefs.ts';
import { asProjectId, asUserId } from '../src/types/index.ts';

type LocalStorageStub = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const localStorageStub: LocalStorageStub = {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageStub,
  });

  return store;
}

test('budget collapse state is isolated per user for the same project', () => {
  const store = installLocalStorageStub();
  const projectId = asProjectId('prj_test');
  const userA = asUserId('u_a');
  const userB = asUserId('u_b');

  saveBudgetCollapseState(
    projectId,
    {
      collapsedYears: { '2026': true },
      collapsedQuarters: { '2026_Q1': true },
    },
    { userId: userA }
  );

  saveBudgetCollapseState(
    projectId,
    {
      collapsedYears: { '2025': true },
      collapsedQuarters: { '2025_Q4': true },
    },
    { userId: userB }
  );

  assert.equal(store.size, 2);
  assert.deepEqual(loadBudgetCollapseState(projectId, { userId: userA }), {
    collapsedYears: { '2026': true },
    collapsedQuarters: { '2026_Q1': true },
  });
  assert.deepEqual(loadBudgetCollapseState(projectId, { userId: userB }), {
    collapsedYears: { '2025': true },
    collapsedQuarters: { '2025_Q4': true },
  });
});

test('budget collapse state keeps anonymous storage isolated from signed-in users', () => {
  installLocalStorageStub();
  const projectId = asProjectId('prj_test');
  const userId = asUserId('u_signed_in');

  saveBudgetCollapseState(
    projectId,
    {
      collapsedYears: { '2024': true },
      collapsedQuarters: {},
    },
    { userId: null }
  );

  saveBudgetCollapseState(
    projectId,
    {
      collapsedYears: { '2026': true },
      collapsedQuarters: {},
    },
    { userId }
  );

  assert.deepEqual(loadBudgetCollapseState(projectId, { userId: null }), {
    collapsedYears: { '2024': true },
    collapsedQuarters: {},
  });
  assert.deepEqual(loadBudgetCollapseState(projectId, { userId }), {
    collapsedYears: { '2026': true },
    collapsedQuarters: {},
  });

  clearBudgetCollapseState(projectId, { userId });
  assert.equal(loadBudgetCollapseState(projectId, { userId }), null);
  assert.deepEqual(loadBudgetCollapseState(projectId, { userId: null }), {
    collapsedYears: { '2024': true },
    collapsedQuarters: {},
  });
});

test('budget collapse helpers fail closed when localStorage throws', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    },
  });

  const projectId = asProjectId('prj_test');
  const userId = asUserId('u_throw');
  assert.equal(loadBudgetCollapseState(projectId, { userId }), null);
  assert.doesNotThrow(() =>
    saveBudgetCollapseState(
      projectId,
      { collapsedYears: {}, collapsedQuarters: {} },
      { userId }
    )
  );
  assert.doesNotThrow(() => clearBudgetCollapseState(projectId, { userId }));
});

test('budget collapse state ignores invalid stored payloads', () => {
  installLocalStorageStub();
  const projectId = asProjectId('prj_test');
  const userId = asUserId('u_invalid');

  globalThis.localStorage.setItem(
    'projex_budget_collapse_v1:u_invalid:prj_test',
    '{"collapsedYears":42}'
  );

  assert.equal(loadBudgetCollapseState(projectId, { userId }), null);
});
