import test from 'node:test';
import assert from 'node:assert/strict';

import { LocalApi } from '../src/api/local/localApi.ts';
import { ServerApi } from '../src/api/server/serverApi.ts';
import { AppError, isAppError } from '../src/api/errors.ts';
import type { ProjexApi } from '../src/api/types.ts';
import { requireServerUserId, withServerBoundary } from '../src/server/fns/runtime.ts';
import { getAuthSessionFromRequest } from '../src/server/auth/betterAuth.ts';
import { devEndpointsEnabled } from '../src/server/dev/devSession.ts';
import {
  __resetServerStartupEnvValidationForTests,
  validateServerStartupEnv,
} from '../src/server/env.ts';
import { asBudgetLineId, asCategoryId, asCompanyId, asProjectId, asSubCategoryId, asUserId } from '../src/types.ts';
import { can } from '../src/utils/auth.ts';
import { buildCorsHeaders, isOriginAllowed } from '../src/server/http/security.ts';

function installMemoryLocalStorage() {
  const previousWindow = (globalThis as { window?: unknown }).window;
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
  return () => {
    if (typeof previousWindow === 'undefined') {
      delete (globalThis as { window?: unknown }).window;
      return;
    }
    (globalThis as { window?: unknown }).window = previousWindow;
  };
}

function restoreEnv(key: string, prev: string | undefined) {
  if (typeof prev === 'undefined') {
    delete process.env[key];
    return;
  }
  process.env[key] = prev;
}

function stripLocalServerOrigin(url: string): string {
  return url.replace(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/, '');
}

type AdapterHarness = {
  api: ProjexApi;
  cleanup?: () => void;
};

function appErrorStatus(code: AppError['code']): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'CONFLICT') return 409;
  if (code === 'VALIDATION_ERROR') return 422;
  if (code === 'NOT_IMPLEMENTED') return 501;
  return 500;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

async function parseJsonBody(init?: RequestInit): Promise<unknown> {
  if (!init?.body) return null;
  if (typeof init.body === 'string') return JSON.parse(init.body) as unknown;
  if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
  return JSON.parse(String(init.body)) as unknown;
}

async function makeLocalHarness(): Promise<AdapterHarness> {
  const cleanupWindow = installMemoryLocalStorage();
  return { api: new LocalApi(), cleanup: cleanupWindow };
}

async function makeServerApiBackedByLocalHarness(): Promise<AdapterHarness> {
  const cleanupWindow = installMemoryLocalStorage();
  const backing = new LocalApi();
  const originalFetch = globalThis.fetch;

  (globalThis as { fetch: typeof fetch }).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    try {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const parts = url.pathname.split('/').filter(Boolean);

      if (method === 'POST' && url.pathname === '/api/dev/session') {
        const body = (await parseJsonBody(init)) as { userId?: string } | null;
        return jsonResponse(await backing.loginAs(asUserId(String(body?.userId ?? ''))));
      }

      if (
        method === 'GET' &&
        parts[0] === 'api' &&
        parts[1] === 'companies' &&
        parts[3] === 'summary'
      ) {
        return jsonResponse(await backing.getCompanySummary(asCompanyId(parts[2])));
      }

      if (
        parts[0] === 'api' &&
        parts[1] === 'projects' &&
        parts[3] === 'transactions'
      ) {
        const projectId = asProjectId(parts[2]);
        if (method === 'GET' && parts.length === 4) {
          return jsonResponse(await backing.listTransactions(projectId));
        }
        if (method === 'PATCH' && parts.length === 4) {
          const body = (await parseJsonBody(init)) as { txn?: Parameters<ProjexApi['updateTxn']>[1] };
          if (!body.txn) throw new AppError('VALIDATION_ERROR', 'Missing transaction body');
          return jsonResponse(await backing.updateTxn(projectId, body.txn));
        }
        if (method === 'POST' && parts[4] === 'import') {
          const body = (await parseJsonBody(init)) as Parameters<ProjexApi['importTransactions']>[1];
          return jsonResponse(await backing.importTransactions(projectId, body));
        }
      }

      return jsonResponse({ code: 'NOT_FOUND', message: `Unhandled test route ${method} ${url.pathname}` }, 404);
    } catch (err) {
      if (err instanceof AppError) {
        return jsonResponse(
          { code: err.code, message: err.message, meta: err.meta ?? null },
          appErrorStatus(err.code)
        );
      }
      return jsonResponse(
        { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error' },
        500
      );
    }
  }) as typeof fetch;

  return {
    api: new ServerApi(),
    cleanup: () => {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
      cleanupWindow();
    },
  };
}

function runAdapterParityTests(
  label: string,
  makeHarness: () => Promise<AdapterHarness>
) {
  test(`${label}: company summary uses project total budgets`, async () => {
    const harness = await makeHarness();
    try {
      await harness.api.loginAs(asUserId('u_exec'));

      const summary = await harness.api.getCompanySummary(asCompanyId('co_acme'));
      const alpha = summary.projects.find((project) => project.id === asProjectId('prj_acme_alpha'));
      const beta = summary.projects.find((project) => project.id === asProjectId('prj_acme_beta'));

      assert.ok(alpha);
      assert.ok(beta);
      assert.equal(alpha.budgetCents, 5000000);
      assert.equal(beta.budgetCents, 2500000);
    } finally {
      harness.cleanup?.();
    }
  });

  test(`${label}: transaction coding updates preserve date and list order`, async () => {
    const harness = await makeHarness();
    try {
      await harness.api.loginAs(asUserId('u_exec'));

      const projectId = asProjectId('prj_acme_alpha');
      const before = await harness.api.listTransactions(projectId);
      const txn = before.find((item) => item.categoryId && item.subCategoryId);
      assert.ok(txn, 'seed should include a coded transaction');
      assert.ok(txn.categoryId);
      assert.ok(txn.subCategoryId);

      const originalDate = txn.date;
      const originalOrder = before.map((item) => item.id);
      const updated = await harness.api.updateTxn(projectId, {
        id: txn.id,
        categoryId: txn.categoryId,
        subCategoryId: null,
        codingSource: 'manual',
        codingPendingApproval: false,
      });
      const after = await harness.api.listTransactions(projectId);

      assert.equal(updated.date, originalDate);
      assert.deepEqual(after.map((item) => item.id), originalOrder);
    } finally {
      harness.cleanup?.();
    }
  });

  test(`${label}: import rejects duplicate externalId within the same project`, async () => {
    const harness = await makeHarness();
    try {
      await harness.api.loginAs(asUserId('u_superadmin'));

      const projectId = asProjectId('prj_acme_alpha');
      const seed = await harness.api.listTransactions(projectId);
      const existing = seed[0];
      assert.ok(existing, 'seed should have at least one transaction');
      assert.ok(existing.externalId, 'seed transaction should expose externalId');

      const dupe = {
        ...existing,
        id: `${existing.id}_dupe` as typeof existing.id,
        externalId: existing.externalId,
      };

      await assert.rejects(
        () => harness.api.importTransactions(projectId, { txns: [dupe], mode: 'append' }),
        (err) =>
          isAppError(err) &&
          err.code === 'VALIDATION_ERROR' &&
          /Duplicate transaction externalId/i.test(err.message)
      );
    } finally {
      harness.cleanup?.();
    }
  });
}

runAdapterParityTests('LocalApi parity', makeLocalHarness);
runAdapterParityTests('ServerApi HTTP parity', makeServerApiBackedByLocalHarness);

test('ServerApi loginAs targets dev session endpoint', async () => {
  const api = new ServerApi();
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  (globalThis as { fetch: typeof fetch }).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ userId: 'u_superadmin' }), { status: 200 });
  }) as typeof fetch;

  try {
    const session = await api.loginAs(asUserId('u_superadmin'));
    assert.equal(stripLocalServerOrigin(capturedUrl), '/api/dev/session');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(session.userId, asUserId('u_superadmin'));
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
});

test('ServerApi resetToSeed targets dev reset endpoint', async () => {
  const api = new ServerApi();
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  (globalThis as { fetch: typeof fetch }).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await api.resetToSeed();
    assert.equal(stripLocalServerOrigin(capturedUrl), '/api/dev/reset-seed');
    assert.equal(capturedInit?.method, 'POST');
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
});

test('ServerApi routes taxonomy and budget methods through Start endpoints', async () => {
  const api = new ServerApi();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = stripLocalServerOrigin(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({
      url: String(input),
      method,
    });

    const category = {
      id: 'cat_1',
      companyId: 'co_acme',
      projectId: 'prj_acme_alpha',
      name: 'Travel',
    };
    const subCategory = {
      id: 'sub_1',
      companyId: 'co_acme',
      projectId: 'prj_acme_alpha',
      categoryId: 'cat_1',
      name: 'Flights',
    };
    const budget = {
      id: 'bud_1',
      companyId: 'co_acme',
      projectId: 'prj_acme_alpha',
      categoryId: 'cat_1',
      subCategoryId: 'sub_1',
      allocatedCents: 1000,
    };

    if (method === 'GET' && url.endsWith('/categories')) {
      return new Response(JSON.stringify([category]), { status: 200 });
    }
    if (method === 'GET' && url.endsWith('/sub-categories')) {
      return new Response(JSON.stringify([subCategory]), { status: 200 });
    }
    if (method === 'GET' && url.endsWith('/budgets')) {
      return new Response(JSON.stringify([budget]), { status: 200 });
    }
    if (method === 'POST' && url.endsWith('/categories')) {
      return new Response(JSON.stringify(category), { status: 200 });
    }
    if (method === 'POST' && url.endsWith('/budgets')) {
      return new Response(JSON.stringify(budget), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const projectId = asProjectId('prj_acme_alpha');
  try {
    await api.listCategories(projectId);
    await api.listSubCategories(projectId);
    await api.createCategory(projectId, {
      projectId,
      companyId: asCompanyId('co_acme'),
      name: 'Travel',
    });
    await api.deleteCategory(projectId, asCategoryId('cat_1'));
    await api.listBudgets(projectId);
    await api.createBudget(projectId, {
      projectId,
      companyId: asCompanyId('co_acme'),
      categoryId: asCategoryId('cat_1'),
      subCategoryId: asSubCategoryId('sub_1'),
      allocatedCents: 1000,
    });
    await api.deleteBudget(projectId, asBudgetLineId('bud_1'));
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }

  const paths = calls.map((c) => `${c.method} ${stripLocalServerOrigin(c.url)}`);
  assert.ok(paths.includes('GET /api/projects/prj_acme_alpha/categories'));
  assert.ok(paths.includes('GET /api/projects/prj_acme_alpha/sub-categories'));
  assert.ok(paths.includes('POST /api/projects/prj_acme_alpha/categories'));
  assert.ok(paths.includes('DELETE /api/projects/prj_acme_alpha/categories/cat_1'));
  assert.ok(paths.includes('GET /api/projects/prj_acme_alpha/budgets'));
  assert.ok(paths.includes('POST /api/projects/prj_acme_alpha/budgets'));
  assert.ok(paths.includes('DELETE /api/projects/prj_acme_alpha/budgets/bud_1'));
});

test('Dev endpoints require explicit enable flag and non-production', () => {
  const prevEnable = process.env.PROJEX_ENABLE_DEV_ENDPOINTS;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'true';
    process.env.NODE_ENV = 'development';
    assert.equal(devEndpointsEnabled(), true);

    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
    process.env.NODE_ENV = 'development';
    assert.equal(devEndpointsEnabled(), false);

    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'true';
    process.env.NODE_ENV = 'production';
    assert.equal(devEndpointsEnabled(), false);
  } finally {
    restoreEnv('PROJEX_ENABLE_DEV_ENDPOINTS', prevEnable);
    restoreEnv('NODE_ENV', prevNodeEnv);
  }
});

test('Auth adapter resolves BetterAuth session endpoint when configured', async () => {
  const prevUrl = process.env.BETTER_AUTH_SESSION_URL;
  const originalFetch = globalThis.fetch;
  process.env.BETTER_AUTH_SESSION_URL = 'https://auth.example.test/api/session';

  let seenCookie = '';
  (globalThis as { fetch: typeof fetch }).fetch = (async (
    _input: string | URL | Request,
    init?: RequestInit
  ) => {
    seenCookie = String((init?.headers as Headers | undefined)?.get?.('cookie') ?? '');
    return new Response(JSON.stringify({ user: { id: 'u_superadmin' } }), { status: 200 });
  }) as typeof fetch;

  try {
    const session = await getAuthSessionFromRequest(
      new Request('http://localhost/x', {
        headers: { cookie: 'sid=abc123' },
      })
    );
    assert.equal(session?.userId, asUserId('u_superadmin'));
    assert.equal(seenCookie, 'sid=abc123');
  } finally {
    restoreEnv('BETTER_AUTH_SESSION_URL', prevUrl);
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
});

test('Auth adapter falls back to dev cookie session', async () => {
  const prevUrl = process.env.BETTER_AUTH_SESSION_URL;
  const prevEnable = process.env.PROJEX_ENABLE_DEV_ENDPOINTS;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.BETTER_AUTH_SESSION_URL = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'true';
    process.env.NODE_ENV = 'development';
    const session = await getAuthSessionFromRequest(
      new Request('http://localhost/x', {
        headers: { cookie: 'projex_dev_user_id=u_member' },
      })
    );
    assert.equal(session?.userId, asUserId('u_member'));
  } finally {
    restoreEnv('BETTER_AUTH_SESSION_URL', prevUrl);
    restoreEnv('PROJEX_ENABLE_DEV_ENDPOINTS', prevEnable);
    restoreEnv('NODE_ENV', prevNodeEnv);
  }
});

test('Auth adapter resolves local BetterAuth session from the current request origin first', async () => {
  const prevDirect = process.env.BETTER_AUTH_DIRECT_SESSION_FN;
  const prevUrl = process.env.BETTER_AUTH_SESSION_URL;
  const prevBase = process.env.BETTER_AUTH_URL;
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  try {
    process.env.BETTER_AUTH_DIRECT_SESSION_FN = '';
    process.env.BETTER_AUTH_SESSION_URL = '';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    (globalThis as { fetch: typeof fetch }).fetch = (async (
      input: string | URL | Request
    ) => {
      seenUrls.push(String(input));
      return new Response(JSON.stringify({ user: { id: 'u_superadmin' } }), { status: 200 });
    }) as typeof fetch;

    const session = await getAuthSessionFromRequest(
      new Request('http://localhost:5173/api/session', {
        headers: { cookie: 'sid=abc123' },
      })
    );

    assert.equal(session?.userId, asUserId('u_superadmin'));
    assert.deepEqual(seenUrls, ['http://localhost:5173/api/auth/get-session']);
  } finally {
    restoreEnv('BETTER_AUTH_DIRECT_SESSION_FN', prevDirect);
    restoreEnv('BETTER_AUTH_SESSION_URL', prevUrl);
    restoreEnv('BETTER_AUTH_URL', prevBase);
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
});

test('Auth adapter ignores spoofed x-projex-user-id header', async () => {
  const prevDirect = process.env.BETTER_AUTH_DIRECT_SESSION_FN;
  const prevUrl = process.env.BETTER_AUTH_SESSION_URL;
  const prevBase = process.env.BETTER_AUTH_URL;
  const prevEnable = process.env.PROJEX_ENABLE_DEV_ENDPOINTS;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.BETTER_AUTH_DIRECT_SESSION_FN = '';
    process.env.BETTER_AUTH_SESSION_URL = '';
    process.env.BETTER_AUTH_URL = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
    process.env.NODE_ENV = 'production';
    const session = await getAuthSessionFromRequest(
      new Request('http://localhost/x', {
        headers: { 'x-projex-user-id': 'u_superadmin' },
      })
    );
    assert.equal(session, null);
  } finally {
    restoreEnv('BETTER_AUTH_DIRECT_SESSION_FN', prevDirect);
    restoreEnv('BETTER_AUTH_SESSION_URL', prevUrl);
    restoreEnv('BETTER_AUTH_URL', prevBase);
    restoreEnv('PROJEX_ENABLE_DEV_ENDPOINTS', prevEnable);
    restoreEnv('NODE_ENV', prevNodeEnv);
  }
});

test('Auth adapter resolves direct BetterAuth resolver module when configured', async () => {
  const prevDirect = process.env.BETTER_AUTH_DIRECT_SESSION_FN;
  const prevUrl = process.env.BETTER_AUTH_SESSION_URL;
  try {
    process.env.BETTER_AUTH_DIRECT_SESSION_FN =
      './tests/fixtures/direct-auth-provider.mjs#getSessionFromRequest';
    process.env.BETTER_AUTH_SESSION_URL = '';
    const session = await getAuthSessionFromRequest(new Request('http://localhost/x'));
    assert.equal(session?.userId, asUserId('u_direct'));
  } finally {
    restoreEnv('BETTER_AUTH_DIRECT_SESSION_FN', prevDirect);
    restoreEnv('BETTER_AUTH_SESSION_URL', prevUrl);
  }
});

test('Authorization denies company access outside memberships', () => {
  const allowed = can({
    userId: asUserId('u_member'),
    action: 'company:view',
    companyId: asCompanyId('co_globex'),
    companyMemberships: [{ userId: asUserId('u_member'), companyId: asCompanyId('co_acme'), role: 'member' }],
    projectMemberships: [],
  });
  assert.equal(allowed, false);
});

test('Authorization allows superadmin visibility across companies', () => {
  const allowed = can({
    userId: asUserId('u_superadmin'),
    action: 'company:view',
    companyId: asCompanyId('co_globex'),
    companyMemberships: [{ userId: asUserId('u_superadmin'), companyId: asCompanyId('co_projex'), role: 'superadmin' }],
    projectMemberships: [],
  });
  assert.equal(allowed, true);
});

test('Server runtime request path rejects unauthenticated requests', async () => {
  const prevUrl = process.env.BETTER_AUTH_SESSION_URL;
  const prevEnable = process.env.PROJEX_ENABLE_DEV_ENDPOINTS;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.BETTER_AUTH_SESSION_URL = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
    process.env.NODE_ENV = 'development';
    await assert.rejects(
      () => requireServerUserId({ request: new Request('http://localhost/none') }),
      (err) => isAppError(err) && err.code === 'UNAUTHENTICATED'
    );
  } finally {
    restoreEnv('BETTER_AUTH_SESSION_URL', prevUrl);
    restoreEnv('PROJEX_ENABLE_DEV_ENDPOINTS', prevEnable);
    restoreEnv('NODE_ENV', prevNodeEnv);
  }
});

test('Startup env validator requires prod env vars and blocks dev endpoints in prod', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDb = process.env.DATABASE_URL;
  const prevSecret = process.env.BETTER_AUTH_SECRET;
  const prevBase = process.env.BETTER_AUTH_URL;
  const prevAuth = process.env.BETTER_AUTH_SESSION_URL;
  const prevDirect = process.env.BETTER_AUTH_DIRECT_SESSION_FN;
  const prevDev = process.env.PROJEX_ENABLE_DEV_ENDPOINTS;
  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = '';
    process.env.BETTER_AUTH_SECRET = '';
    process.env.BETTER_AUTH_URL = '';
    process.env.BETTER_AUTH_SESSION_URL = '';
    process.env.BETTER_AUTH_DIRECT_SESSION_FN = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
    __resetServerStartupEnvValidationForTests();
    assert.throws(
      () => validateServerStartupEnv(),
      (err) => isAppError(err) && err.code === 'INTERNAL_ERROR'
    );

    process.env.DATABASE_URL = 'postgres://example';
    process.env.BETTER_AUTH_SECRET = '';
    process.env.BETTER_AUTH_URL = 'https://app.example.test';
    process.env.BETTER_AUTH_SESSION_URL = 'https://auth.example.test/session';
    process.env.BETTER_AUTH_DIRECT_SESSION_FN = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
    __resetServerStartupEnvValidationForTests();
    assert.throws(
      () => validateServerStartupEnv(),
      (err) => isAppError(err) && err.code === 'INTERNAL_ERROR'
    );

    process.env.DATABASE_URL = 'postgres://example';
    process.env.BETTER_AUTH_SECRET = 'secret';
    process.env.BETTER_AUTH_URL = '';
    process.env.BETTER_AUTH_SESSION_URL = 'https://auth.example.test/session';
    process.env.BETTER_AUTH_DIRECT_SESSION_FN = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
    __resetServerStartupEnvValidationForTests();
    assert.throws(
      () => validateServerStartupEnv(),
      (err) => isAppError(err) && err.code === 'INTERNAL_ERROR'
    );

    process.env.DATABASE_URL = 'postgres://example';
    process.env.BETTER_AUTH_SECRET = 'secret';
    process.env.BETTER_AUTH_URL = 'https://app.example.test';
    process.env.BETTER_AUTH_SESSION_URL = 'https://auth.example.test/session';
    process.env.BETTER_AUTH_DIRECT_SESSION_FN = '';
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'true';
    __resetServerStartupEnvValidationForTests();
    assert.throws(
      () => validateServerStartupEnv(),
      (err) => isAppError(err) && err.code === 'INTERNAL_ERROR'
    );
  } finally {
    restoreEnv('NODE_ENV', prevNodeEnv);
    restoreEnv('DATABASE_URL', prevDb);
    restoreEnv('BETTER_AUTH_SECRET', prevSecret);
    restoreEnv('BETTER_AUTH_URL', prevBase);
    restoreEnv('BETTER_AUTH_SESSION_URL', prevAuth);
    restoreEnv('BETTER_AUTH_DIRECT_SESSION_FN', prevDirect);
    restoreEnv('PROJEX_ENABLE_DEV_ENDPOINTS', prevDev);
    __resetServerStartupEnvValidationForTests();
  }
});

test('CORS helpers allow configured origin and reject unknown origin', () => {
  const prev = process.env.CORS_ALLOWED_ORIGINS;
  try {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';
    assert.equal(isOriginAllowed('https://app.example.com', 'https://api.example.com'), true);
    assert.equal(isOriginAllowed('https://evil.example.com', 'https://api.example.com'), false);
    assert.equal(isOriginAllowed('https://api.example.com', 'https://api.example.com'), true);
    const headers = buildCorsHeaders('https://app.example.com', 'https://api.example.com');
    assert.equal(headers.get('access-control-allow-origin'), 'https://app.example.com');
  } finally {
    restoreEnv('CORS_ALLOWED_ORIGINS', prev);
  }
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

test('LocalApi company summary uses project total budgets for health', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();

  await api.loginAs(asUserId('u_exec'));

  const summary = await api.getCompanySummary(asCompanyId('co_acme'));
  const alpha = summary.projects.find((project) => project.id === asProjectId('prj_acme_alpha'));
  const beta = summary.projects.find((project) => project.id === asProjectId('prj_acme_beta'));

  assert.ok(alpha);
  assert.ok(beta);
  assert.equal(alpha.budgetCents, 5000000);
  assert.equal(beta.budgetCents, 2500000);
});

test('LocalApi transaction coding updates do not change transaction dates', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();

  await api.loginAs(asUserId('u_exec'));

  const projectId = asProjectId('prj_acme_alpha');
  const txns = await api.listTransactions(projectId);
  const txn = txns.find((item) => item.categoryId && item.subCategoryId);
  assert.ok(txn, 'seed should include a coded transaction');

  const originalDate = txn.date;
  const categoryId = txn.categoryId;
  const subCategoryId = txn.subCategoryId;
  assert.ok(categoryId);
  assert.ok(subCategoryId);

  const categoryOnly = await api.updateTxn(projectId, {
    id: txn.id,
    categoryId,
    subCategoryId: null,
    codingSource: 'manual',
    codingPendingApproval: false,
  });
  assert.equal(categoryOnly.date, originalDate);

  const recoded = await api.updateTxn(projectId, {
    id: txn.id,
    categoryId,
    subCategoryId,
    codingSource: 'manual',
    codingPendingApproval: false,
  });
  assert.equal(recoded.date, originalDate);
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

test('LocalApi listCompanies is scoped to memberships for non-superadmin users', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();
  await api.loginAs(asUserId('u_viewer'));
  const companies = await api.listCompanies();
  assert.equal(companies.length, 1);
  assert.equal(String(companies[0].id), 'co_globex');
});

test('LocalApi superadmin company list excludes bootstrap shell company', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();
  await api.loginAs(asUserId('u_superadmin'));
  const companies = await api.listCompanies();
  const ids = companies.map((c) => String(c.id));
  assert.ok(!ids.includes('co_projex'));
  assert.ok(ids.includes('co_acme'));
  assert.ok(ids.includes('co_globex'));
});

test('LocalApi sets deactivatedAt on project deactivation', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();

  await api.loginAs(asUserId('u_exec'));
  const projectId = asProjectId('prj_acme_beta');
  await api.deactivateProject(projectId);

  const project = await api.getProject(projectId);
  assert.ok(project);
  assert.equal(project.status, 'archived');
  assert.ok(project.deactivatedAt);
});

test('LocalApi blocks non-admin access to archived project', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();

  await api.loginAs(asUserId('u_exec'));
  const projectId = asProjectId('prj_acme_beta');
  await api.deactivateProject(projectId);

  await api.loginAs(asUserId('u_member'));
  await assert.rejects(
    () => api.getProject(projectId),
    (err) =>
      isAppError(err) &&
      err.code === 'FORBIDDEN' &&
      /deactivated/i.test(err.message)
  );
});

test('LocalApi createUserInCompany reuses an existing user by email', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();
  await api.loginAs(asUserId('u_superadmin'));

  const result = await api.createUserInCompany(asCompanyId('co_acme'), {
    name: 'Dup User',
    email: 'member@acme.co',
    role: 'member',
  });

  assert.equal(result.user.id, asUserId('u_member'));
  assert.equal(result.createdAuthUser, false);
  assert.equal(result.membershipCreated, false);
});

test('LocalApi createUserInCompany returns invite metadata for local mode', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();
  await api.loginAs(asUserId('u_superadmin'));

  const result = await api.createUserInCompany(
    asCompanyId('co_acme'),
    {
      name: 'New Local User',
      email: 'new-local-user@example.com',
      role: 'member',
    }
  );

  assert.equal(result.user.email, 'new-local-user@example.com');
  assert.equal(result.createdAuthUser, true);
  assert.equal(result.membershipCreated, true);
  assert.equal(result.onboardingEmailSent, false);
  assert.equal(result.onboardingDelivery, 'none');
});

test('LocalApi removeCompanyMember also removes project memberships in that company', async () => {
  installMemoryLocalStorage();
  const api = new LocalApi();
  await api.loginAs(asUserId('u_superadmin'));

  const before = await api.listProjectMemberships(asProjectId('prj_acme_alpha'));
  assert.ok(before.some((m) => String(m.userId) === 'u_member'));

  await api.removeCompanyMember(asCompanyId('co_acme'), asUserId('u_member'));

  const companyMemberships = await api.listCompanyMemberships(asCompanyId('co_acme'));
  assert.ok(!companyMemberships.some((m) => String(m.userId) === 'u_member'));

  const after = await api.listProjectMemberships(asProjectId('prj_acme_alpha'));
  assert.ok(!after.some((m) => String(m.userId) === 'u_member'));
});

test('Server runtime requires authenticated session context', async () => {
  await assert.rejects(
    () => requireServerUserId({}),
    (err) => isAppError(err) && err.code === 'UNAUTHENTICATED'
  );
});

test('Server runtime normalizes unknown errors to AppError', async () => {
  await assert.rejects(
    () =>
      withServerBoundary(async () => {
        throw new Error('boom');
      }),
    (err) =>
      isAppError(err) &&
      err.code === 'INTERNAL_ERROR' &&
      /boom/i.test(err.message)
  );
});

test('AppError preserves code and message contract', () => {
  const err = new AppError('VALIDATION_ERROR', 'x');
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(err.message, 'x');
});
