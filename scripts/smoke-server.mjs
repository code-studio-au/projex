import fs from 'node:fs';
import path from 'node:path';

for (const envFileName of ['.env.local', '.env.smoke.local']) {
  loadEnvFile(path.resolve(process.cwd(), envFileName));
}

const baseUrl = (process.env.PROJEX_SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const validSections = new Set([
  'basics',
  'appPages',
  'emailChange',
  'temporaryData',
  'companyDefaults',
  'inviteFlow',
  'privacyChecks',
]);
const requestedSections = parseRequestedSections(process.argv.slice(2));

const cookieJar = new Map();
const interactiveTerminal = Boolean(process.stdout.isTTY && !process.env.CI);
const spinnerFrames = ['-', '\\', '|', '/'];
let activeSpinner = null;

function parseRequestedSections(argv) {
  const sections = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--section') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value after --section');
      sections.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--section=')) {
      sections.push(arg.slice('--section='.length));
      continue;
    }
  }

  for (const section of sections) {
    if (!validSections.has(section)) {
      throw new Error(
        `Unknown smoke section "${section}". Valid sections: ${Array.from(validSections).join(', ')}`
      );
    }
  }

  return new Set(sections);
}

function shouldRunSection(sectionId) {
  return requestedSections.size === 0 || requestedSections.has(sectionId);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

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

  const email = process.env.PROJEX_SMOKE_EMAIL?.trim();
  const password = process.env.PROJEX_SMOKE_PASSWORD?.trim();
  const forceReset = process.env.PROJEX_SMOKE_FORCE_RESET === 'true';
  const resetEmail = process.env.PROJEX_SMOKE_RESET_EMAIL?.trim() || email;
  const inviteEmail = process.env.PROJEX_SMOKE_INVITE_EMAIL?.trim();
  const inviteName = process.env.PROJEX_SMOKE_INVITE_NAME?.trim() || 'Smoke Invite';
  const inviteRole = process.env.PROJEX_SMOKE_INVITE_ROLE?.trim() || 'member';
  const emailChangeTo = process.env.PROJEX_SMOKE_EMAIL_CHANGE_TO?.trim();
  const privacyAdminEmail = process.env.PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL?.trim();
  const privacyAdminPassword = process.env.PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD?.trim();
  const privacySuperadminEmail = process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL?.trim();
  const privacySuperadminPassword = process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD?.trim();
  const isLocalBaseUrl =
    baseUrl.startsWith('http://localhost') || baseUrl.startsWith('http://127.0.0.1');

  let session = null;
  let companyList = [];
  let company = null;
  let projects = null;
  let project = null;

  async function ensureAuthAndProject(options = {}) {
    if (session && company && project) return;

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

    session = await runStep('Checking current session', async () => {
      const currentSession = await request('/api/session');
      assertOk(currentSession, 'session');
      return currentSession;
    });
    if (!session.body?.userId) throw new Error('No session userId returned');

    if (options.includePasswordReset && resetEmail) {
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
    companyList = Array.isArray(companies.body) ? companies.body : [];
    company =
      companyList.find((c) => c.id !== 'co_projex') ??
      companyList[0];
    if (!company?.id) {
      throw new Error(
        `No company available for smoke test (session userId=${session.body.userId}). ` +
          'Ensure this BetterAuth user is linked to app memberships (npm run auth:link-user).'
      );
    }

    projects = await runStep(`Loading projects for company ${companyLabel(company)}`, async () => {
      const result = await request(`/api/companies/${encodeURIComponent(company.id)}/projects`);
      assertOk(result, 'projects');
      return result;
    });
    project = (projects.body ?? [])[0];
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
  }

  if (shouldRunSection('basics')) {
    logSection('Basics');
    await runStep('Checking health endpoint', async () => {
      assertOk(await request('/api/health'), 'health');
    });
    await runStep('Checking readiness endpoint', async () => {
      assertOk(await request('/api/ready'), 'ready');
    });
    await ensureAuthAndProject({ includePasswordReset: true });
  }

  if (shouldRunSection('appPages')) {
    await ensureAuthAndProject();
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
  }

  if (shouldRunSection('emailChange')) {
    await ensureAuthAndProject();
    logSection('Email Change');
    if (emailChangeTo) {
      await runStep(`Requesting verified email change to ${emailChangeTo}`, async () => {
        const result = await request('/api/me/email-change', {
          method: 'POST',
          body: JSON.stringify({ newEmail: emailChangeTo }),
        });
        assertOk(result, 'request email change');
      });

      await runStep('Checking pending email change', async () => {
        const result = await request('/api/me/email-change');
        assertOk(result, 'get pending email change');
        if (!result.body || result.body.newEmail !== emailChangeTo) {
          throw new Error(`Pending email change did not match ${emailChangeTo}`);
        }
      });

      await runStep(`Resending email change verification to ${emailChangeTo}`, async () => {
        const result = await request('/api/me/email-change/resend', {
          method: 'POST',
        });
        assertOk(result, 'resend email change');
        if (result.body?.newEmail !== emailChangeTo) {
          throw new Error(`Resent email change did not match ${emailChangeTo}`);
        }
      });

      await runStep('Cancelling pending email change', async () => {
        const result = await request('/api/me/email-change', {
          method: 'DELETE',
        });
        assertOk(result, 'cancel email change');
      });

      await runStep('Checking pending email change was cleared', async () => {
        const result = await request('/api/me/email-change');
        assertOk(result, 'get pending email change after cancel');
        if (result.body !== null) {
          throw new Error('Pending email change was still present after cancel');
        }
      });
    } else {
      noteStep('Skipping email-change flow; set PROJEX_SMOKE_EMAIL_CHANGE_TO to enable it');
    }
  }

  const categoryId = uniqueId('cat_smoke');
  const budgetId = uniqueId('bud_smoke');
  const categoryName = uniqueId('Smoke Category');
  const budgetName = uniqueId('Smoke Budget');

  if (shouldRunSection('temporaryData')) {
    await ensureAuthAndProject();
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
  }

  if (shouldRunSection('companyDefaults')) {
    await ensureAuthAndProject();
    logSection('Company Defaults');

    const defaultCategoryId = uniqueId('ccat_smoke');
    const preferredDefaultSubCategoryId = uniqueId('csub_smoke_preferred');
    const fallbackDefaultSubCategoryId = uniqueId('csub_smoke_fallback');
    const preferredMappingRuleId = uniqueId('cmap_smoke_preferred');
    const fallbackMappingRuleId = uniqueId('cmap_smoke_fallback');
    const defaultCategoryName = uniqueId('Smoke Transport');
    const preferredDefaultSubCategoryName = uniqueId('Smoke Flights Preferred');
    const fallbackDefaultSubCategoryName = uniqueId('Smoke Flights Fallback');
    const preferredMatchText = uniqueId('smoke flight match');
    const fallbackMatchText = preferredMatchText.split(' ').slice(0, -1).join(' ');
    const txnId = uniqueId('txn_smoke_defaults');
    const txnExternalId = uniqueId('external_smoke_defaults');

    let projectCategoryId = null;
    let projectPreferredSubCategoryId = null;
    let importedTxnId = null;
    let smokeBudgetId = null;
    let createdDefaultCategory = false;
    let createdPreferredDefaultSubCategory = false;
    let createdFallbackDefaultSubCategory = false;
    let createdPreferredDefaultMapping = false;
    let createdFallbackDefaultMapping = false;

    try {
      await runStep(`Creating company default category ${defaultCategoryName}`, async () => {
        const result = await request(`/api/companies/${encodeURIComponent(company.id)}/default-categories`, {
          method: 'POST',
          body: JSON.stringify({
            id: defaultCategoryId,
            companyId: company.id,
            name: defaultCategoryName,
          }),
        });
        assertOk(result, 'create company default category');
        createdDefaultCategory = true;
      });

      await runStep(
        `Creating company default subcategories ${preferredDefaultSubCategoryName} and ${fallbackDefaultSubCategoryName}`,
        async () => {
        const preferredResult = await request(
          `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: preferredDefaultSubCategoryId,
              companyId: company.id,
              companyDefaultCategoryId: defaultCategoryId,
              name: preferredDefaultSubCategoryName,
            }),
          }
        );
        assertOk(preferredResult, 'create preferred company default subcategory');
        createdPreferredDefaultSubCategory = true;

        const fallbackResult = await request(
          `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: fallbackDefaultSubCategoryId,
              companyId: company.id,
              companyDefaultCategoryId: defaultCategoryId,
              name: fallbackDefaultSubCategoryName,
            }),
          }
        );
        assertOk(fallbackResult, 'create fallback company default subcategory');
        createdFallbackDefaultSubCategory = true;
      });

      await runStep(`Creating overlapping company default mapping rules for ${preferredMatchText}`, async () => {
        const preferredResult = await request(`/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules`, {
          method: 'POST',
          body: JSON.stringify({
            id: preferredMappingRuleId,
            companyId: company.id,
            matchText: preferredMatchText,
            companyDefaultCategoryId: defaultCategoryId,
            companyDefaultSubCategoryId: preferredDefaultSubCategoryId,
            sortOrder: 999998,
          }),
        });
        assertOk(preferredResult, 'create preferred company default mapping rule');
        createdPreferredDefaultMapping = true;

        const fallbackResult = await request(`/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules`, {
          method: 'POST',
          body: JSON.stringify({
            id: fallbackMappingRuleId,
            companyId: company.id,
            matchText: fallbackMatchText,
            companyDefaultCategoryId: defaultCategoryId,
            companyDefaultSubCategoryId: fallbackDefaultSubCategoryId,
            sortOrder: 999999,
          }),
        });
        assertOk(fallbackResult, 'create fallback company default mapping rule');
        createdFallbackDefaultMapping = true;
      });

      await runStep('Applying company defaults to the project', async () => {
        const result = await request(
          `/api/projects/${encodeURIComponent(project.id)}/apply-company-default-taxonomy`,
          { method: 'POST' }
        );
        assertOk(result, 'apply company defaults');
        if (!result.body?.companyDefaultsConfigured) {
          throw new Error('Company defaults were not reported as configured during apply.');
        }
      });

      await runStep(`Importing a matching uncoded transaction for ${preferredMatchText}`, async () => {
        const result = await request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions/import`,
          {
            method: 'POST',
            body: JSON.stringify({
              mode: 'append',
              autoCreateBudgets: true,
              txns: [
                {
                  id: txnId,
                  externalId: txnExternalId,
                  companyId: company.id,
                  projectId: project.id,
                  date: '2024-01-09',
                  item: 'Smoke Imported Flight',
                  description: `Auto-map ${preferredMatchText}`,
                  amountCents: 24560,
                },
              ],
            }),
          }
        );
        assertOk(result, 'import auto-mapped transaction');
      });

      await runStep('Verifying the imported transaction was auto-mapped', async () => {
        const result = await request(`/api/projects/${encodeURIComponent(project.id)}/transactions`);
        assertOk(result, 'list imported transactions');
        const txns = Array.isArray(result.body) ? result.body : [];
        const imported = txns.find((txn) => txn.id === txnId || txn.externalId === txnExternalId);
        if (!imported) throw new Error('Imported smoke transaction was not found.');
        if (!imported.categoryId || !imported.subCategoryId) {
          throw new Error('Imported smoke transaction was not coded by company defaults.');
        }
        if (!imported.codingPendingApproval) {
          throw new Error('Imported smoke transaction was not marked pending approval.');
        }
        importedTxnId = imported.id;

        const categoriesResult = await request(`/api/projects/${encodeURIComponent(project.id)}/categories`);
        assertOk(categoriesResult, 'list project categories after apply');
        const projectCategories = Array.isArray(categoriesResult.body) ? categoriesResult.body : [];
        projectCategoryId =
          projectCategories.find((category) => category.name === defaultCategoryName)?.id ?? null;
        if (!projectCategoryId) {
          throw new Error(`Applied project category ${defaultCategoryName} was not found.`);
        }

        const subCategoriesResult = await request(
          `/api/projects/${encodeURIComponent(project.id)}/sub-categories`
        );
        assertOk(subCategoriesResult, 'list project subcategories after apply');
        const projectSubCategories = Array.isArray(subCategoriesResult.body) ? subCategoriesResult.body : [];
        projectPreferredSubCategoryId =
          projectSubCategories.find(
            (subCategory) =>
              subCategory.name === preferredDefaultSubCategoryName &&
              subCategory.categoryId === projectCategoryId
          )?.id ?? null;
        if (!projectPreferredSubCategoryId) {
          throw new Error(`Applied project subcategory ${preferredDefaultSubCategoryName} was not found.`);
        }
      });

      await runStep('Verifying the higher-priority mapping rule won', async () => {
        if (!importedTxnId) throw new Error('No imported transaction id available for rule-ordering verification.');
        if (!projectPreferredSubCategoryId) {
          throw new Error('No preferred project subcategory id available for rule-ordering verification.');
        }

        const result = await request(`/api/projects/${encodeURIComponent(project.id)}/transactions`);
        assertOk(result, 'list imported transactions for rule-ordering verification');
        const txns = Array.isArray(result.body) ? result.body : [];
        const imported = txns.find((txn) => txn.id === importedTxnId);
        if (!imported) throw new Error('Imported smoke transaction was not found for rule-ordering verification.');
        if (String(imported.subCategoryId ?? '') !== projectPreferredSubCategoryId) {
          throw new Error(
            `Expected higher-priority mapping to target ${preferredDefaultSubCategoryName}, but it mapped elsewhere.`
          );
        }
      });

      await runStep('Approving the auto-mapped transaction', async () => {
        if (!importedTxnId) throw new Error('No imported transaction id available for approval.');
        const result = await request(`/api/projects/${encodeURIComponent(project.id)}/transactions`, {
          method: 'PATCH',
          body: JSON.stringify({
            txn: {
              id: importedTxnId,
              codingPendingApproval: false,
            },
          }),
        });
        assertOk(result, 'approve auto-mapped transaction');
        if (!result.body?.categoryId || !result.body?.subCategoryId) {
          throw new Error('Approved transaction lost its coding.');
        }
        if (result.body?.codingPendingApproval) {
          throw new Error('Approved transaction still shows pending approval.');
        }
      });

      await runStep(`Verifying budget line exists for ${preferredDefaultSubCategoryName}`, async () => {
        const budgetsResult = await request(`/api/projects/${encodeURIComponent(project.id)}/budgets`);
        assertOk(budgetsResult, 'list project budgets');
        const budgets = Array.isArray(budgetsResult.body) ? budgetsResult.body : [];
        const subCategoriesResult = await request(
          `/api/projects/${encodeURIComponent(project.id)}/sub-categories`
        );
        assertOk(subCategoriesResult, 'list project subcategories');
        const projectSubCategories = Array.isArray(subCategoriesResult.body) ? subCategoriesResult.body : [];
        const projectSubCategory = projectSubCategories.find(
          (subCategory) =>
            subCategory.name === preferredDefaultSubCategoryName && subCategory.categoryId === projectCategoryId
        );
        if (!projectSubCategory) {
          throw new Error(`Applied project subcategory ${preferredDefaultSubCategoryName} was not found.`);
        }
        const matchingBudget = budgets.find(
          (entry) => entry.subCategoryId === projectSubCategory.id && entry.categoryId === projectCategoryId
        );
        if (!matchingBudget) {
          throw new Error(`No budget line existed for ${preferredDefaultSubCategoryName} after import.`);
        }
        smokeBudgetId = matchingBudget.id;
      });
    } finally {
      await runStep('Deleting the imported transaction', async () => {
        if (!importedTxnId) return;
        const result = await request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions/${encodeURIComponent(importedTxnId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete imported smoke transaction');
      });

      await runStep('Deleting the temporary budget line', async () => {
        if (!smokeBudgetId) return;
        const result = await request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(smokeBudgetId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary smoke budget');
      });

      await runStep('Deleting the temporary project category', async () => {
        if (!projectCategoryId) return;
        const result = await request(
          `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(projectCategoryId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary smoke project category');
      });

      await runStep('Deleting the temporary company default mapping rule', async () => {
        if (createdPreferredDefaultMapping) {
          const preferredResult = await request(
            `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules/${encodeURIComponent(preferredMappingRuleId)}`,
            { method: 'DELETE' }
          );
          assertOk(preferredResult, 'delete preferred temporary company default mapping rule');
        }
        if (createdFallbackDefaultMapping) {
          const fallbackResult = await request(
            `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules/${encodeURIComponent(fallbackMappingRuleId)}`,
            { method: 'DELETE' }
          );
          assertOk(fallbackResult, 'delete fallback temporary company default mapping rule');
        }
      });

      await runStep('Deleting the temporary company default subcategory', async () => {
        if (createdPreferredDefaultSubCategory) {
          const preferredResult = await request(
            `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories/${encodeURIComponent(preferredDefaultSubCategoryId)}`,
            { method: 'DELETE' }
          );
          assertOk(preferredResult, 'delete preferred temporary company default subcategory');
        }
        if (createdFallbackDefaultSubCategory) {
          const fallbackResult = await request(
            `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories/${encodeURIComponent(fallbackDefaultSubCategoryId)}`,
            { method: 'DELETE' }
          );
          assertOk(fallbackResult, 'delete fallback temporary company default subcategory');
        }
      });

      await runStep('Deleting the temporary company default category', async () => {
        if (!createdDefaultCategory) return;
        const result = await request(
          `/api/companies/${encodeURIComponent(company.id)}/default-categories/${encodeURIComponent(defaultCategoryId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary company default category');
      });
    }
  }

  if (shouldRunSection('inviteFlow')) {
    await ensureAuthAndProject();
    logSection('Invite Flow');
    if (inviteEmail) {
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
  }

  if (shouldRunSection('privacyChecks')) {
    logSection('Privacy Checks');
    if (
      privacyAdminEmail &&
      privacyAdminPassword &&
      privacySuperadminEmail &&
      privacySuperadminPassword
    ) {
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
