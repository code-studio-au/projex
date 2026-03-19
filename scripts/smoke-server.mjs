const baseUrl = (process.env.PROJEX_SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const cookieJar = new Map();

function storeSetCookie(headers) {
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')]
        : [];
  for (const raw of setCookies) {
    if (!raw) continue;
    const first = raw.split(';')[0];
    const eq = first.indexOf('=');
    if (eq < 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!value) cookieJar.delete(name);
    else cookieJar.set(name, value);
  }
}

function cookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (!headers.has('origin')) headers.set('origin', baseUrl);
  if (!headers.has('referer')) headers.set('referer', `${baseUrl}/`);
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  storeSetCookie(res.headers);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { res, body };
}

async function requestHtml(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (!headers.has('origin')) headers.set('origin', baseUrl);
  if (!headers.has('referer')) headers.set('referer', `${baseUrl}/`);

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  storeSetCookie(res.headers);
  const body = await res.text();
  return { res, body };
}

function assertOk(result, label) {
  if (result.res.ok) return;
  throw new Error(`${label} failed: ${result.res.status} ${JSON.stringify(result.body)}`);
}

function isInviteResendRateLimited(result) {
  if (result.res.ok) return false;
  if (result.res.status !== 500) return false;
  const message =
    result.body && typeof result.body === 'object' && 'message' in result.body
      ? String(result.body.message ?? '')
      : '';
  return message.includes('Too many requests');
}

function uniqueId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function assertHtmlOk(result, label) {
  if (!result.res.ok) {
    throw new Error(`${label} failed: ${result.res.status}`);
  }
  const contentType = result.res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(`${label} did not return HTML (${contentType || 'no content-type'})`);
  }
}

function resetCookies() {
  cookieJar.clear();
}

async function loginWithEmailPassword(email, password, label = 'auth login') {
  resetCookies();
  const login = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertOk(login, label);
  const session = await request('/api/session');
  assertOk(session, `${label} session`);
  if (!session.body?.userId) {
    throw new Error(`${label} returned no session userId`);
  }
  return session.body.userId;
}

async function main() {
  console.info(`Smoke test against ${baseUrl}`);

  assertOk(await request('/api/health'), 'health');
  assertOk(await request('/api/ready'), 'ready');

  const email = process.env.PROJEX_SMOKE_EMAIL?.trim();
  const password = process.env.PROJEX_SMOKE_PASSWORD?.trim();
  const forceReset = process.env.PROJEX_SMOKE_FORCE_RESET === 'true';
  const resetEmail = process.env.PROJEX_SMOKE_RESET_EMAIL?.trim() || email;
  const inviteEmail = process.env.PROJEX_SMOKE_INVITE_EMAIL?.trim();
  const inviteName = process.env.PROJEX_SMOKE_INVITE_NAME?.trim() || 'Smoke Invite';
  const inviteRole = process.env.PROJEX_SMOKE_INVITE_ROLE?.trim() || 'member';
  const privacyAdminEmail = process.env.PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL?.trim();
  const privacyAdminPassword = process.env.PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD?.trim();
  const privacySuperadminEmail = process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL?.trim();
  const privacySuperadminPassword = process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD?.trim();
  const isLocalBaseUrl =
    baseUrl.startsWith('http://localhost') || baseUrl.startsWith('http://127.0.0.1');

  assertHtmlOk(await requestHtml('/login'), 'login page');

  if ((!email || !password) && !isLocalBaseUrl) {
    throw new Error(
      'Production-like smoke runs require PROJEX_SMOKE_EMAIL and PROJEX_SMOKE_PASSWORD. ' +
        'Dev reset/login endpoints are disabled on EC2 by design.'
    );
  }

  if (forceReset) {
    assertOk(await request('/api/dev/reset-seed', { method: 'POST' }), 'dev reset-seed');
  } else if (!email || !password) {
    assertOk(await request('/api/dev/reset-seed', { method: 'POST' }), 'dev reset-seed');
  } else {
    console.info('Skipping dev reset-seed for auth smoke flow');
  }

  if (email && password) {
    await loginWithEmailPassword(email, password, 'auth login');
  } else {
    const login = await request('/api/dev/session', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u_superadmin' }),
    });
    assertOk(login, 'dev login');
  }

  const session = await request('/api/session');
  assertOk(session, 'session');
  if (!session.body?.userId) throw new Error('No session userId returned');

  if (resetEmail) {
    const forgotPassword = await request('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({
        email: resetEmail,
        redirectTo: `${baseUrl}/reset-password`,
      }),
    });
    assertOk(forgotPassword, 'request password reset');
  }

  const companies = await request('/api/companies');
  assertOk(companies, 'companies');
  const companyList = Array.isArray(companies.body) ? companies.body : [];
  const company =
    companyList.find((c) => c.id !== 'co_projex') ??
    companyList[0];
  if (!company?.id) {
    throw new Error(
      `No company available for smoke test (session userId=${session.body.userId}). ` +
        'Ensure this BetterAuth user is linked to app memberships (npm run auth:link-user).'
    );
  }

  let projects = await request(`/api/companies/${encodeURIComponent(company.id)}/projects`);
  assertOk(projects, 'projects');
  let project = (projects.body ?? [])[0];
  if (!project?.id && companyList.length > 1) {
    for (const candidate of companyList) {
      if (!candidate?.id || candidate.id === company.id) continue;
      const next = await request(`/api/companies/${encodeURIComponent(candidate.id)}/projects`);
      if (!next.res.ok) continue;
      const maybe = (next.body ?? [])[0];
      if (maybe?.id) {
        projects = next;
        project = maybe;
        break;
      }
    }
  }
  if (!project?.id) throw new Error('No project available for smoke test');

  assertHtmlOk(await requestHtml('/companies'), 'companies page');
  assertHtmlOk(await requestHtml('/account'), 'account page');
  assertHtmlOk(await requestHtml(`/c/${encodeURIComponent(company.id)}`), 'company page');
  assertHtmlOk(
    await requestHtml(`/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`),
    'project page'
  );
  assertHtmlOk(
    await requestHtml(`/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`),
    'project refresh'
  );

  assertOk(
    await request(`/api/projects/${encodeURIComponent(project.id)}/transactions`),
    'transactions list'
  );

  const categoryId = uniqueId('cat_smoke');
  const budgetId = uniqueId('bud_smoke');
  const categoryName = uniqueId('Smoke Category');

  const createdCategory = await request(`/api/projects/${encodeURIComponent(project.id)}/categories`, {
    method: 'POST',
    body: JSON.stringify({
      id: categoryId,
      companyId: company.id,
      projectId: project.id,
      name: categoryName,
    }),
  });
  assertOk(createdCategory, 'create category');

  const createdBudget = await request(`/api/projects/${encodeURIComponent(project.id)}/budgets`, {
    method: 'POST',
    body: JSON.stringify({
      id: budgetId,
      companyId: company.id,
      projectId: project.id,
      categoryId,
      allocatedCents: 1234,
    }),
  });
  assertOk(createdBudget, 'create budget');

  assertOk(
    await request(
      `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(budgetId)}`,
      { method: 'DELETE' }
    ),
    'delete budget'
  );
  assertOk(
    await request(
      `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(categoryId)}`,
      { method: 'DELETE' }
    ),
    'delete category'
  );

  if (inviteEmail) {
    const invite = await request(`/api/companies/${encodeURIComponent(company.id)}/users`, {
      method: 'POST',
      body: JSON.stringify({
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
      }),
    });
    assertOk(invite, 'invite user');

    const invitedUserId = invite.body?.user?.id;
    if (!invitedUserId) {
      throw new Error(`Invite user did not return a user id: ${JSON.stringify(invite.body)}`);
    }

    const resend = await request(
      `/api/companies/${encodeURIComponent(company.id)}/users/${encodeURIComponent(invitedUserId)}/invite`,
      { method: 'POST' }
    );
    if (isInviteResendRateLimited(resend)) {
      console.info('Resend invite was rate-limited, which is acceptable for the immediate resend smoke check');
    } else {
      assertOk(resend, 'resend invite');
    }
  } else {
    console.info('Skipping invite flow; set PROJEX_SMOKE_INVITE_EMAIL to enable it');
  }

  if (
    privacyAdminEmail &&
    privacyAdminPassword &&
    privacySuperadminEmail &&
    privacySuperadminPassword
  ) {
    console.info('Running project privacy toggle smoke flow');

    await request('/api/session', { method: 'DELETE' });
    await loginWithEmailPassword(privacyAdminEmail, privacyAdminPassword, 'privacy admin login');

    const adminCompanies = await request('/api/companies');
    assertOk(adminCompanies, 'privacy admin companies');
    const adminCompany = (adminCompanies.body ?? [])[0];
    if (!adminCompany?.id) throw new Error('No company available for privacy admin smoke test');

    const adminProjects = await request(`/api/companies/${encodeURIComponent(adminCompany.id)}/projects`);
    assertOk(adminProjects, 'privacy admin projects');
    const adminProject = (adminProjects.body ?? []).find((p) => p.status === 'active') ?? (adminProjects.body ?? [])[0];
    if (!adminProject?.id) throw new Error('No project available for privacy admin smoke test');

    const originalAccess = Boolean(adminProject.allowSuperadminAccess);

    assertOk(
      await request(`/api/projects/${encodeURIComponent(adminProject.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ allowSuperadminAccess: true }),
      }),
      'privacy enable superadmin access'
    );

    assertOk(
      await request(`/api/projects/${encodeURIComponent(adminProject.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ allowSuperadminAccess: false }),
      }),
      'privacy disable superadmin access'
    );

    assertHtmlOk(
      await requestHtml(`/c/${encodeURIComponent(adminCompany.id)}/p/${encodeURIComponent(adminProject.id)}`),
      'privacy admin project page after disable'
    );

    await request('/api/session', { method: 'DELETE' });
    await loginWithEmailPassword(
      privacySuperadminEmail,
      privacySuperadminPassword,
      'privacy superadmin login'
    );

    const superProjects = await request(`/api/companies/${encodeURIComponent(adminCompany.id)}/projects`);
    assertOk(superProjects, 'privacy superadmin projects');
    if ((superProjects.body ?? []).some((project) => project.id === adminProject.id)) {
      throw new Error('Restricted project was still visible to superadmin');
    }

    const superProject = await request(`/api/projects/${encodeURIComponent(adminProject.id)}`);
    assertOk(superProject, 'privacy superadmin project fetch');
    if (superProject.body !== null) {
      throw new Error('Restricted project still resolved for superadmin');
    }

    await request('/api/session', { method: 'DELETE' });
    await loginWithEmailPassword(privacyAdminEmail, privacyAdminPassword, 'privacy admin relogin');

    assertOk(
      await request(`/api/projects/${encodeURIComponent(adminProject.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ allowSuperadminAccess: originalAccess }),
      }),
      'privacy restore superadmin access'
    );
  } else {
    console.info(
      'Skipping privacy toggle flow; set PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL, PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD, PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL, and PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD to enable it'
    );
  }

  assertOk(await request('/api/session', { method: 'DELETE' }), 'logout');
  console.info('Smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
