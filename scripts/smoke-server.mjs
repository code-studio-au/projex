const baseUrl = (process.env.PROJEX_SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const cookieJar = new Map();
const interactiveTerminal = Boolean(process.stdout.isTTY && !process.env.CI);
const spinnerFrames = ['-', '\\', '|', '/'];
let activeSpinner = null;

function logSection(title) {
  stopSpinner();
  console.info(`\n== ${title} ==`);
}

function fitTerminalLine(text) {
  if (!interactiveTerminal) return text;
  const columns = process.stdout.columns || 100;
  const maxWidth = Math.max(20, columns - 1);
  if (text.length <= maxWidth) return text;
  return `${text.slice(0, Math.max(0, maxWidth - 3))}...`;
}

function companyLabel(company) {
  if (!company) return 'unknown company';
  return company.name || company.id || 'unknown company';
}

function projectLabel(project) {
  if (!project) return 'unknown project';
  return project.name || project.id || 'unknown project';
}

function userLabel(email, fallbackRole) {
  return email || fallbackRole;
}

function stopSpinner(finalLabel = null) {
  if (!activeSpinner) return;
  clearInterval(activeSpinner.intervalId);
  if (interactiveTerminal) {
    process.stdout.write('\r\x1b[2K');
  }
  if (finalLabel) {
    console.info(finalLabel);
  }
  activeSpinner = null;
}

function startStep(message) {
  stopSpinner();
  if (!interactiveTerminal) {
    console.info(`- ${message}`);
    return;
  }

  let frameIndex = 0;
  const render = () => {
    const frame = spinnerFrames[frameIndex % spinnerFrames.length];
    frameIndex += 1;
    process.stdout.write(`\r${fitTerminalLine(`[${frame}] ${message}`)}`);
  };

  render();
  const intervalId = setInterval(render, 120);
  activeSpinner = { intervalId, message };
}

function completeStep(message) {
  stopSpinner(`[ok] ${message}`);
}

function noteStep(message) {
  stopSpinner();
  console.info(`[..] ${message}`);
}

async function runStep(message, fn) {
  startStep(message);
  try {
    const result = await fn();
    completeStep(message);
    return result;
  } catch (error) {
    stopSpinner(`[!!] ${message}`);
    throw error;
  }
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginWithEmailPassword(email, password, label = 'auth login') {
  resetCookies();
  const backoffsMs = [1500, 3000, 5000];
  let login = null;
  for (let attempt = 0; attempt <= backoffsMs.length; attempt += 1) {
    login = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (login.res.status !== 429) break;
    if (attempt === backoffsMs.length) break;
    const backoffMs = backoffsMs[attempt];
    stopSpinner();
    console.info(`${label} was rate-limited, retrying after ${backoffMs}ms`);
    await sleep(backoffMs);
    if (interactiveTerminal) startStep(label);
  }
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

  logSection('Basics');
  await runStep('Checking health endpoint', async () => {
    assertOk(await request('/api/health'), 'health');
  });
  await runStep('Checking readiness endpoint', async () => {
    assertOk(await request('/api/ready'), 'ready');
  });

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

  await runStep('Checking login page HTML', async () => {
    assertHtmlOk(await requestHtml('/login'), 'login page');
  });

  if ((!email || !password) && !isLocalBaseUrl) {
    throw new Error(
      'Production-like smoke runs require PROJEX_SMOKE_EMAIL and PROJEX_SMOKE_PASSWORD. ' +
        'Dev reset/login endpoints are disabled on EC2 by design.'
    );
  }

  if (forceReset) {
    await runStep('Resetting dev seed data', async () => {
      assertOk(await request('/api/dev/reset-seed', { method: 'POST' }), 'dev reset-seed');
    });
  } else if (!email || !password) {
    await runStep('Resetting dev seed data', async () => {
      assertOk(await request('/api/dev/reset-seed', { method: 'POST' }), 'dev reset-seed');
    });
  } else {
    noteStep('Skipping dev reset-seed for auth smoke flow');
  }

  if (email && password) {
    await runStep(`Logging in as ${email}`, async () => {
      await loginWithEmailPassword(email, password, 'auth login');
    });
  } else {
    await runStep('Using dev session login', async () => {
      const login = await request('/api/dev/session', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u_superadmin' }),
      });
      assertOk(login, 'dev login');
    });
  }

  const session = await runStep('Checking current session', async () => {
    const currentSession = await request('/api/session');
    assertOk(currentSession, 'session');
    return currentSession;
  });
  if (!session.body?.userId) throw new Error('No session userId returned');

  if (resetEmail) {
    await runStep(`Requesting password reset email for ${resetEmail}`, async () => {
      const forgotPassword = await request('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({
          email: resetEmail,
          redirectTo: `${baseUrl}/reset-password`,
        }),
      });
      assertOk(forgotPassword, 'request password reset');
    });
  }

  const companies = await runStep('Loading companies', async () => {
    const result = await request('/api/companies');
    assertOk(result, 'companies');
    return result;
  });
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

  let projects = await runStep(`Loading projects for company ${companyLabel(company)}`, async () => {
    const result = await request(`/api/companies/${encodeURIComponent(company.id)}/projects`);
    assertOk(result, 'projects');
    return result;
  });
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

  logSection('App Pages');
  await runStep('Checking companies page HTML', async () => {
    assertHtmlOk(await requestHtml('/companies'), 'companies page');
  });
  await runStep('Checking account page HTML', async () => {
    assertHtmlOk(await requestHtml('/account'), 'account page');
  });
  await runStep('Checking company page HTML', async () => {
    assertHtmlOk(await requestHtml(`/c/${encodeURIComponent(company.id)}`), 'company page');
  });
  await runStep('Checking project page HTML', async () => {
    assertHtmlOk(
      await requestHtml(`/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`),
      'project page'
    );
  });
  await runStep('Checking project refresh HTML', async () => {
    assertHtmlOk(
      await requestHtml(`/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`),
      'project refresh'
    );
  });

  await runStep(`Loading transactions for project ${projectLabel(project)}`, async () => {
    assertOk(
      await request(`/api/projects/${encodeURIComponent(project.id)}/transactions`),
      'transactions list'
    );
  });

  const categoryId = uniqueId('cat_smoke');
  const budgetId = uniqueId('bud_smoke');
  const categoryName = uniqueId('Smoke Category');
  const budgetName = uniqueId('Smoke Budget');

  logSection('Temporary Data');
  await runStep(`Creating temporary category ${categoryName}`, async () => {
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
  });

  await runStep(`Creating temporary budget ${budgetName}`, async () => {
    const createdBudget = await request(`/api/projects/${encodeURIComponent(project.id)}/budgets`, {
      method: 'POST',
      body: JSON.stringify({
        id: budgetId,
        companyId: company.id,
        projectId: project.id,
        categoryId,
        name: budgetName,
        allocatedCents: 1234,
      }),
    });
    assertOk(createdBudget, 'create budget');
  });

  await runStep(`Deleting temporary budget ${budgetName}`, async () => {
    assertOk(
      await request(
        `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(budgetId)}`,
        { method: 'DELETE' }
      ),
      'delete budget'
    );
  });
  await runStep(`Deleting temporary category ${categoryName}`, async () => {
    assertOk(
      await request(
        `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(categoryId)}`,
        { method: 'DELETE' }
      ),
      'delete category'
    );
  });

  if (inviteEmail) {
    logSection('Invite Flow');
    const invite = await runStep(`Inviting ${inviteEmail} to company ${companyLabel(company)} as ${inviteRole}`, async () => {
      const result = await request(`/api/companies/${encodeURIComponent(company.id)}/users`, {
        method: 'POST',
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      assertOk(result, 'invite user');
      return result;
    });

    const invitedUserId = invite.body?.user?.id;
    if (!invitedUserId) {
      throw new Error(`Invite user did not return a user id: ${JSON.stringify(invite.body)}`);
    }

    await runStep(`Attempting immediate resend for invited user ${inviteEmail}`, async () => {
      const resend = await request(
        `/api/companies/${encodeURIComponent(company.id)}/users/${encodeURIComponent(invitedUserId)}/invite`,
        { method: 'POST' }
      );
      if (isInviteResendRateLimited(resend)) {
        noteStep('Resend invite was rate-limited, which is acceptable for the immediate resend smoke check');
      } else {
        assertOk(resend, 'resend invite');
      }
    });
  } else {
    noteStep('Skipping invite flow; set PROJEX_SMOKE_INVITE_EMAIL to enable it');
  }

  if (
    privacyAdminEmail &&
    privacyAdminPassword &&
    privacySuperadminEmail &&
    privacySuperadminPassword
  ) {
    logSection('Privacy Checks');

    await request('/api/session', { method: 'DELETE' });
    await runStep(`Logging in as admin ${userLabel(privacyAdminEmail, 'admin')}`, async () => {
      await loginWithEmailPassword(privacyAdminEmail, privacyAdminPassword, 'privacy admin login');
    });

    const adminCompanies = await runStep('Loading admin companies', async () => {
      const result = await request('/api/companies');
      assertOk(result, 'privacy admin companies');
      return result;
    });
    const adminCompany = (adminCompanies.body ?? [])[0];
    if (!adminCompany?.id) throw new Error('No company available for privacy admin smoke test');

    const adminProjects = await runStep(`Loading admin projects for company ${companyLabel(adminCompany)}`, async () => {
      const result = await request(`/api/companies/${encodeURIComponent(adminCompany.id)}/projects`);
      assertOk(result, 'privacy admin projects');
      return result;
    });
    const adminProject = (adminProjects.body ?? []).find((p) => p.status === 'active') ?? (adminProjects.body ?? [])[0];
    if (!adminProject?.id) throw new Error('No project available for privacy admin smoke test');

    const originalAccess = Boolean(adminProject.allowSuperadminAccess);

    await runStep(`Enabling superadmin access for project ${projectLabel(adminProject)}`, async () => {
      assertOk(
        await request(`/api/projects/${encodeURIComponent(adminProject.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ allowSuperadminAccess: true }),
        }),
        'privacy enable superadmin access'
      );
    });

    await runStep(`Disabling superadmin access for project ${projectLabel(adminProject)}`, async () => {
      assertOk(
        await request(`/api/projects/${encodeURIComponent(adminProject.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ allowSuperadminAccess: false }),
        }),
        'privacy disable superadmin access'
      );
    });

    await runStep('Confirming admin can still view the project page', async () => {
      assertHtmlOk(
        await requestHtml(`/c/${encodeURIComponent(adminCompany.id)}/p/${encodeURIComponent(adminProject.id)}`),
        'privacy admin project page after disable'
      );
    });

    await request('/api/session', { method: 'DELETE' });
    await sleep(1000);
    await runStep(`Logging in as superadmin ${userLabel(privacySuperadminEmail, 'superadmin')}`, async () => {
      await loginWithEmailPassword(
        privacySuperadminEmail,
        privacySuperadminPassword,
        'privacy superadmin login'
      );
    });

    const superProjects = await runStep('Checking restricted project is hidden from superadmin project list', async () => {
      const result = await request(`/api/companies/${encodeURIComponent(adminCompany.id)}/projects`);
      assertOk(result, 'privacy superadmin projects');
      return result;
    });
    if ((superProjects.body ?? []).some((project) => project.id === adminProject.id)) {
      throw new Error('Restricted project was still visible to superadmin');
    }

    const superProject = await runStep('Checking restricted project cannot be fetched by superadmin', async () => {
      const result = await request(`/api/projects/${encodeURIComponent(adminProject.id)}`);
      assertOk(result, 'privacy superadmin project fetch');
      return result;
    });
    if (superProject.body !== null) {
      throw new Error('Restricted project still resolved for superadmin');
    }

    await request('/api/session', { method: 'DELETE' });
    await sleep(1000);
    await runStep(`Relogging in as admin ${userLabel(privacyAdminEmail, 'admin')}`, async () => {
      await loginWithEmailPassword(privacyAdminEmail, privacyAdminPassword, 'privacy admin relogin');
    });

    await runStep(
      `Restoring original superadmin access (${String(originalAccess)}) for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await request(`/api/projects/${encodeURIComponent(adminProject.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ allowSuperadminAccess: originalAccess }),
          }),
          'privacy restore superadmin access'
        );
      }
    );
  } else {
    noteStep(
      'Skipping privacy toggle flow; set PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL, PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD, PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL, and PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD to enable it'
    );
  }

  await runStep('Logging out', async () => {
    assertOk(await request('/api/session', { method: 'DELETE' }), 'logout');
  });
  console.info('Smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
