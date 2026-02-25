import test from 'node:test';
import assert from 'node:assert/strict';

import { LocalApi } from '../src/api/local/localApi.ts';
import { ServerApi } from '../src/api/server/serverApi.ts';
import { AppError, isAppError } from '../src/api/errors.ts';
import { asProjectId, asUserId } from '../src/types.ts';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
}

test('ServerApi returns NOT_IMPLEMENTED for stubbed methods', async () => {
  const api = new ServerApi();
  await assert.rejects(
    () => api.listCompanies(),
    (err) => isAppError(err) && err.code === 'NOT_IMPLEMENTED'
  );
});

test('LocalApi import rejects duplicate externalId within the same project', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();

  await api.loginAs(asUserId('u_superadmin'));

  const projectId = asProjectId('prj_acme_alpha');
  const seed = await api.listTransactions(projectId);
  const existing = seed[0];
  assert.ok(existing, 'seed should have at least one transaction');
  assert.ok(existing.externalId, 'seed transaction should expose externalId');

  const dupe = {
    ...existing,
    id: `${existing.id}_dupe` as typeof existing.id,
    externalId: existing.externalId,
  };

  await assert.rejects(
    () => api.importTransactions(projectId, { txns: [dupe], mode: 'append' }),
    (err) =>
      isAppError(err) &&
      err.code === 'VALIDATION_ERROR' &&
      /Duplicate transaction externalId/i.test(err.message)
  );
});

test('LocalApi keeps membership reads scoped for non-superadmin users', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();

  await api.loginAs(asUserId('u_member'));
  const all = await api.listAllCompanyMemberships();
  // u_member only belongs to co_acme in seed data.
  const companyIds = new Set(all.map((m) => String(m.companyId)));
  assert.deepEqual([...companyIds], ['co_acme']);
});

test('AppError preserves code and message contract', () => {
  const err = new AppError('VALIDATION_ERROR', 'x');
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(err.message, 'x');
});
