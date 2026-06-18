import { z } from 'zod';

import type {
  SmokeSectionId,
  SmokeSectionResult,
  SmokeStepResult,
} from '../../types/index.ts';
import { smokeSectionDefinitions } from '../../types/index.ts';
import { parseJsonOrText } from '../../utils/json.ts';
import {
  apiMessageResponseSchema,
  authenticatedSessionResponseSchema,
  applyCompanyDefaultsResultResponseSchema,
  budgetLinesResponseSchema,
  categoriesResponseSchema,
  companyExportJobResponseSchema,
  companyMembershipsResponseSchema,
  companiesResponseSchema,
  companySummaryResponseSchema,
  companyUserInviteResultResponseSchema,
  emailChangeRequestResponseSchema,
  pendingEmailChangeResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  subCategoriesResponseSchema,
  txnResponseSchema,
  txnsResponseSchema,
  usersResponseSchema,
} from '../../validation/responseSchemas.ts';
import { getSmokeRequestBaseUrl, loadSmokeEnvFiles } from './env.ts';
const smokeSectionMap = new Map(
  smokeSectionDefinitions.map((section) => [section.id, section])
);

type HttpResult = {
  res: Response;
  body: unknown;
};

type Retry429Options = {
  label: string;
  backoffsMs?: number[];
};

type Recorder = {
  step<T>(id: string, label: string, fn: () => Promise<T>): Promise<T>;
  skip(id: string, label: string, detail: string): void;
};

type RunSmokeSectionOptions = {
  onStep?: (step: SmokeStepResult) => void | Promise<void>;
  onStatus?: (message: string) => void | Promise<void>;
};

type SmokeCompany = {
  id: string;
  name?: string;
};

type SmokeProject = {
  id: string;
  name?: string;
  status?: string;
  allowSuperadminAccess?: boolean;
};

function uniqueId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function companyLabel(company: SmokeCompany | null | undefined) {
  if (!company) return 'unknown company';
  return company.name || company.id || 'unknown company';
}

function projectLabel(project: SmokeProject | null | undefined) {
  if (!project) return 'unknown project';
  return project.name || project.id || 'unknown project';
}

function userLabel(email: string | undefined, fallbackRole: string) {
  return email || fallbackRole;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertOk(result: HttpResult | null, label: string) {
  if (result?.res.ok) return;
  throw new Error(
    `${label} failed: ${result?.res.status ?? 'unknown'} ${JSON.stringify(result?.body ?? null)}`
  );
}

function assertHtmlOk(result: { res: Response; body: string }, label: string) {
  if (!result.res.ok) throw new Error(`${label} failed: ${result.res.status}`);
  const contentType = result.res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(
      `${label} did not return HTML (${contentType || 'no content-type'})`
    );
  }
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, label: string): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const firstIssue = parsed.error.issues[0];
  throw new Error(
    `${label} returned unexpected shape${firstIssue ? `: ${firstIssue.message}` : ''}`
  );
}

function extractApiMessage(body: unknown): string {
  const parsed = apiMessageResponseSchema.safeParse(body);
  return parsed.success ? (parsed.data.message ?? '') : '';
}

function isInviteResendRateLimited(result: HttpResult) {
  if (result.res.ok) return false;
  if (result.res.status !== 500) return false;
  const message = extractApiMessage(result.body);
  return message.includes('Too many requests');
}

class SmokeHttpClient {
  private readonly baseUrl: string;
  private readonly cookieJar = new Map<string, string>();
  private readonly onStatus?: (message: string) => void | Promise<void>;

  constructor(
    baseUrl: string,
    onStatus?: (message: string) => void | Promise<void>
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.onStatus = onStatus;
  }

  private async emitStatus(message: string) {
    await this.onStatus?.(message);
  }

  private storeSetCookie(headers: Headers) {
    const setCookies =
      typeof (headers as Headers & { getSetCookie?: () => string[] })
        .getSetCookie === 'function'
        ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : [];
    for (const raw of setCookies) {
      if (!raw) continue;
      const first = raw.split(';')[0];
      const eq = first.indexOf('=');
      if (eq < 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!value) this.cookieJar.delete(name);
      else this.cookieJar.set(name, value);
    }
  }

  private cookieHeader() {
    return Array.from(this.cookieJar.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  resetCookies() {
    this.cookieJar.clear();
  }

  async request(urlPath: string, init: RequestInit = {}): Promise<HttpResult> {
    const headers = new Headers(init.headers ?? {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (!headers.has('origin')) headers.set('origin', this.baseUrl);
    if (!headers.has('referer')) headers.set('referer', `${this.baseUrl}/`);
    if (!headers.has('content-type') && init.body) {
      headers.set('content-type', 'application/json');
    }

    const res = await fetch(`${this.baseUrl}${urlPath}`, { ...init, headers });
    this.storeSetCookie(res.headers);
    const text = await res.text();
    const body = parseJsonOrText(text);
    return { res, body };
  }

  async requestWith429Retry(
    urlPath: string,
    init: RequestInit = {},
    options: Retry429Options
  ): Promise<HttpResult> {
    const backoffsMs = options.backoffsMs ?? [1500, 3000, 5000];
    let result: HttpResult | null = null;
    for (let attempt = 0; attempt <= backoffsMs.length; attempt += 1) {
      result = await this.request(urlPath, init);
      if (result.res.status !== 429) break;
      if (attempt === backoffsMs.length) break;
      await this.emitStatus(
        `${options.label} was rate-limited. Retrying in ${(backoffsMs[attempt] / 1000).toFixed(1)}s.`
      );
      await sleep(backoffsMs[attempt]);
    }
    if (!result) {
      throw new Error(`${options.label} failed before a response was received`);
    }
    return result;
  }

  async requestHtml(urlPath: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (!headers.has('origin')) headers.set('origin', this.baseUrl);
    if (!headers.has('referer')) headers.set('referer', `${this.baseUrl}/`);
    const res = await fetch(`${this.baseUrl}${urlPath}`, { ...init, headers });
    this.storeSetCookie(res.headers);
    const body = await res.text();
    return { res, body };
  }

  async requestBinary(urlPath: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (!headers.has('origin')) headers.set('origin', this.baseUrl);
    if (!headers.has('referer')) headers.set('referer', `${this.baseUrl}/`);
    const res = await fetch(`${this.baseUrl}${urlPath}`, { ...init, headers });
    this.storeSetCookie(res.headers);
    return {
      res,
      bytes: new Uint8Array(await res.arrayBuffer()),
    };
  }

  async loginWithEmailPassword(email: string, password: string, label: string) {
    this.resetCookies();
    const backoffsMs = [1500, 3000, 5000];
    let login: HttpResult | null = null;
    for (let attempt = 0; attempt <= backoffsMs.length; attempt += 1) {
      login = await this.request('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (login.res.status !== 429) break;
      if (attempt === backoffsMs.length) break;
      await this.emitStatus(
        `${label} was rate-limited. Retrying in ${(backoffsMs[attempt] / 1000).toFixed(1)}s.`
      );
      await sleep(backoffsMs[attempt]);
    }
    assertOk(login, label);
    const session = await this.request('/api/session');
    assertOk(session, `${label} session`);
    return parseBody(
      authenticatedSessionResponseSchema,
      session.body,
      `${label} session`
    );
  }
}

async function withRecorder(
  sectionId: SmokeSectionId,
  run: (recorder: Recorder) => Promise<void>,
  options?: RunSmokeSectionOptions
): Promise<SmokeSectionResult> {
  const startedAt = new Date();
  const steps: SmokeStepResult[] = [];

  const recorder: Recorder = {
    async step<T>(id: string, label: string, fn: () => Promise<T>) {
      const started = Date.now();
      try {
        const result = await fn();
        const step = {
          id,
          label,
          status: 'passed' as const,
          durationMs: Date.now() - started,
        };
        steps.push(step);
        await options?.onStep?.(step);
        return result;
      } catch (error) {
        const step = {
          id,
          label,
          status: 'failed' as const,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        };
        steps.push(step);
        await options?.onStep?.(step);
        throw error;
      }
    },
    skip(id: string, label: string, detail: string) {
      const step = {
        id,
        label,
        status: 'skipped' as const,
        durationMs: 0,
        detail,
      };
      steps.push(step);
      void options?.onStep?.(step);
    },
  };

  try {
    await run(recorder);
  } catch {
    // Step failure already recorded.
  }

  const finishedAt = new Date();
  const label = smokeSectionMap.get(sectionId)?.label ?? sectionId;
  const hasFailure = steps.some((step) => step.status === 'failed');
  const hasPass = steps.some((step) => step.status === 'passed');
  const status = hasFailure ? 'failed' : hasPass ? 'passed' : 'skipped';
  return {
    sectionId,
    label,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    steps,
  };
}

async function authenticatePrimaryUser(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string,
  options?: { includePasswordReset?: boolean }
) {
  loadSmokeEnvFiles();
  const email = process.env.PROJEX_SMOKE_EMAIL?.trim();
  const password = process.env.PROJEX_SMOKE_PASSWORD?.trim();
  const resetEmail = process.env.PROJEX_SMOKE_RESET_EMAIL?.trim() || email;
  const isLocalBaseUrl =
    baseUrl.startsWith('http://localhost') ||
    baseUrl.startsWith('http://127.0.0.1');

  await recorder.step('login-page', 'Checking login page HTML', async () => {
    assertHtmlOk(await client.requestHtml('/login'), 'login page');
  });

  if (!email || !password) {
    throw new Error(
      isLocalBaseUrl
        ? 'Server smoke runs now require PROJEX_SMOKE_EMAIL and PROJEX_SMOKE_PASSWORD in .env.smoke.local. Bootstrap a real app user first with pnpm run auth:bootstrap-user.'
        : 'Server smoke runs on non-local URLs require PROJEX_SMOKE_EMAIL and PROJEX_SMOKE_PASSWORD in .env.smoke.local.'
    );
  }

  await recorder.step('auth-login', `Logging in as ${email}`, async () => {
    await client.loginWithEmailPassword(email, password, 'auth login');
  });

  await recorder.step('session', 'Checking current session', async () => {
    const currentSession = await client.request('/api/session');
    assertOk(currentSession, 'session');
  });

  if (options?.includePasswordReset && resetEmail) {
    await recorder.step(
      'password-reset',
      `Requesting password reset email for ${resetEmail}`,
      async () => {
        const forgotPassword = await client.requestWith429Retry(
          '/api/auth/request-password-reset',
          {
            method: 'POST',
            body: JSON.stringify({
              email: resetEmail,
              redirectTo: `${baseUrl}/reset-password`,
            }),
          },
          { label: 'request password reset' }
        );
        assertOk(forgotPassword, 'request password reset');
      }
    );
  } else if (options?.includePasswordReset) {
    recorder.skip(
      'password-reset',
      'Skipping password reset request',
      'No reset email was configured.'
    );
  }
}

async function loadPrimaryCompanyAndProject(
  recorder: Recorder,
  client: SmokeHttpClient
) {
  loadSmokeEnvFiles();
  const preferredCompanyId = process.env.PROJEX_SMOKE_COMPANY_ID?.trim();
  const preferredProjectId = process.env.PROJEX_SMOKE_PROJECT_ID?.trim();
  const companies = await recorder.step(
    'companies',
    'Loading companies',
    async () => {
      const result = await client.request('/api/companies');
      assertOk(result, 'companies');
      return parseBody(companiesResponseSchema, result.body, 'companies');
    }
  );

  const company = preferredCompanyId
    ? companies.find((candidate) => candidate.id === preferredCompanyId)
    : companies[0];
  if (!company?.id) throw new Error('No company available for smoke test.');

  const projects = await recorder.step(
    'projects',
    `Loading projects for company ${companyLabel(company)}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/projects`
      );
      assertOk(result, 'projects');
      return parseBody(projectsResponseSchema, result.body, 'projects');
    }
  );

  const project = preferredProjectId
    ? projects.find((candidate) => candidate.id === preferredProjectId)
    : (projects.find((candidate) => candidate.status === 'active') ??
      projects[0]);
  if (!project?.id) throw new Error('No project available for smoke test.');

  return { company, project };
}

async function selectInitialProjectOwnerUserId(
  recorder: Recorder,
  client: SmokeHttpClient,
  companyId: string
): Promise<string> {
  return recorder.step(
    'project-owner',
    'Selecting a non-superadmin project owner',
    async () => {
      const membershipsResult = await client.request(
        `/api/companies/${encodeURIComponent(companyId)}/memberships`
      );
      assertOk(membershipsResult, 'list company memberships');
      const memberships = parseBody(
        companyMembershipsResponseSchema,
        membershipsResult.body,
        'list company memberships'
      );

      const usersResult = await client.request('/api/users');
      assertOk(usersResult, 'list users');
      const users = parseBody(
        usersResponseSchema,
        usersResult.body,
        'list users'
      );
      const usersById = new Map(users.map((user) => [user.id, user]));

      const eligibleMembership = memberships.find((membership) => {
        const user = usersById.get(membership.userId);
        return user && user.isGlobalSuperadmin !== true;
      });

      if (!eligibleMembership) {
        throw new Error(
          'No non-superadmin company member is available to assign as the initial project owner.'
        );
      }

      return eligibleMembership.userId;
    }
  );
}

async function runBasicsSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await recorder.step('health', 'Checking health endpoint', async () => {
    assertOk(await client.request('/api/health'), 'health');
  });
  await recorder.step('ready', 'Checking readiness endpoint', async () => {
    assertOk(await client.request('/api/ready'), 'ready');
  });
  await authenticatePrimaryUser(recorder, client, baseUrl, {
    includePasswordReset: true,
  });
  await loadPrimaryCompanyAndProject(recorder, client);
}

async function runAppPagesSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company, project } = await loadPrimaryCompanyAndProject(
    recorder,
    client
  );

  await recorder.step(
    'companies-page',
    'Checking companies page HTML',
    async () => {
      assertHtmlOk(await client.requestHtml('/companies'), 'companies page');
    }
  );
  await recorder.step(
    'account-page',
    'Checking account page HTML',
    async () => {
      assertHtmlOk(await client.requestHtml('/account'), 'account page');
    }
  );
  await recorder.step(
    'company-page',
    'Checking company page HTML',
    async () => {
      assertHtmlOk(
        await client.requestHtml(`/c/${encodeURIComponent(company.id)}`),
        'company page'
      );
    }
  );
  await recorder.step(
    'project-page',
    'Checking project page HTML',
    async () => {
      assertHtmlOk(
        await client.requestHtml(
          `/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`
        ),
        'project page'
      );
    }
  );
  await recorder.step(
    'project-refresh',
    'Checking project refresh HTML',
    async () => {
      assertHtmlOk(
        await client.requestHtml(
          `/c/${encodeURIComponent(company.id)}/p/${encodeURIComponent(project.id)}`
        ),
        'project refresh'
      );
    }
  );
  await recorder.step(
    'transactions',
    `Loading transactions for project ${projectLabel(project)}`,
    async () => {
      assertOk(
        await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`
        ),
        'transactions list'
      );
    }
  );
}

async function runEmailChangeSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  loadSmokeEnvFiles();
  const emailChangeTo = process.env.PROJEX_SMOKE_EMAIL_CHANGE_TO?.trim();
  await authenticatePrimaryUser(recorder, client, baseUrl);

  if (!emailChangeTo) {
    recorder.skip(
      'email-change-skipped',
      'Skipping email-change flow',
      'Set PROJEX_SMOKE_EMAIL_CHANGE_TO in .env.smoke.local to enable this section.'
    );
    return;
  }

  await recorder.step(
    'email-change-request',
    `Requesting verified email change to ${emailChangeTo}`,
    async () => {
      const result = await client.requestWith429Retry(
        '/api/me/email-change',
        {
          method: 'POST',
          body: JSON.stringify({ newEmail: emailChangeTo }),
        },
        { label: 'request email change' }
      );
      assertOk(result, 'request email change');
    }
  );
  await recorder.step(
    'email-change-pending',
    'Checking pending email change',
    async () => {
      const result = await client.request('/api/me/email-change');
      assertOk(result, 'get pending email change');
      const body = parseBody(
        pendingEmailChangeResponseSchema,
        result.body,
        'get pending email change'
      );
      if (body?.newEmail !== emailChangeTo) {
        throw new Error(`Pending email change did not match ${emailChangeTo}`);
      }
    }
  );
  await recorder.step(
    'email-change-resend',
    `Resending email change verification to ${emailChangeTo}`,
    async () => {
      const result = await client.requestWith429Retry(
        '/api/me/email-change/resend',
        { method: 'POST' },
        { label: 'resend email change' }
      );
      assertOk(result, 'resend email change');
      const body = parseBody(
        emailChangeRequestResponseSchema,
        result.body,
        'resend email change'
      );
      if (body.newEmail !== emailChangeTo) {
        throw new Error(`Resent email change did not match ${emailChangeTo}`);
      }
    }
  );
  await recorder.step(
    'email-change-cancel',
    'Cancelling pending email change',
    async () => {
      const result = await client.request('/api/me/email-change', {
        method: 'DELETE',
      });
      assertOk(result, 'cancel email change');
    }
  );
  await recorder.step(
    'email-change-cleared',
    'Checking pending email change was cleared',
    async () => {
      const result = await client.request('/api/me/email-change');
      assertOk(result, 'get pending email change after cancel');
      const body = parseBody(
        pendingEmailChangeResponseSchema,
        result.body,
        'get pending email change after cancel'
      );
      if (body !== null) {
        throw new Error('Pending email change was still present after cancel');
      }
    }
  );
}

async function runTemporaryDataSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company, project } = await loadPrimaryCompanyAndProject(
    recorder,
    client
  );
  const initialOwnerUserId = await selectInitialProjectOwnerUserId(
    recorder,
    client,
    company.id
  );
  const categoryId = uniqueId('cat_smoke');
  const budgetId = uniqueId('bud_smoke');
  const categoryName = uniqueId('Smoke Category');
  const budgetName = uniqueId('Smoke Budget');

  await recorder.step(
    'create-category',
    `Creating temporary category ${categoryName}`,
    async () => {
      const createdCategory = await client.request(
        `/api/projects/${encodeURIComponent(project.id)}/categories`,
        {
          method: 'POST',
          body: JSON.stringify({
            id: categoryId,
            companyId: company.id,
            projectId: project.id,
            name: categoryName,
          }),
        }
      );
      assertOk(createdCategory, 'create category');
    }
  );

  try {
    await recorder.step(
      'create-budget',
      `Creating temporary budget ${budgetName}`,
      async () => {
        const createdBudget = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: budgetId,
              companyId: company.id,
              projectId: project.id,
              categoryId,
              name: budgetName,
              allocatedCents: 1234,
            }),
          }
        );
        assertOk(createdBudget, 'create budget');
      }
    );
  } catch (error) {
    await client.request(
      `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(categoryId)}`,
      { method: 'DELETE' }
    );
    throw error;
  }

  await recorder.step(
    'delete-budget',
    `Deleting temporary budget ${budgetName}`,
    async () => {
      assertOk(
        await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(budgetId)}`,
          { method: 'DELETE' }
        ),
        'delete budget'
      );
    }
  );
  await recorder.step(
    'delete-category',
    `Deleting temporary category ${categoryName}`,
    async () => {
      assertOk(
        await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(categoryId)}`,
          { method: 'DELETE' }
        ),
        'delete category'
      );
    }
  );

  await runProgrammesTemporaryDataSteps(
    recorder,
    client,
    company.id,
    initialOwnerUserId
  );
}

async function runProgrammesTemporaryDataSteps(
  recorder: Recorder,
  client: SmokeHttpClient,
  companyId: string,
  initialOwnerUserId: string
) {
  const programmeId = uniqueId('prg_smoke');
  const childProjectId = uniqueId('prj_programme_smoke');
  const categoryId = uniqueId('cat_programme_smoke');
  const subCategoryId = uniqueId('sub_programme_smoke');
  const txnId = uniqueId('txn_programme_smoke');
  const programmeName = uniqueId('Smoke Programme');
  const childProjectName = uniqueId('Smoke Programme Child');

  let programmeCreated = false;
  let childCreated = false;

  try {
    await recorder.step(
      'create-programme',
      `Creating temporary programme ${programmeName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(companyId)}/projects`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: programmeId,
              name: programmeName,
              projectType: 'programme',
              currency: 'AUD',
              initialOwnerUserId,
            }),
          }
        );
        assertOk(result, 'create programme');
        const programme = parseBody(
          projectResponseSchema,
          result.body,
          'create programme'
        );
        if (programme.projectType !== 'programme') {
          throw new Error('Created programme was not marked as programme.');
        }
        programmeCreated = true;
      }
    );

    await recorder.step(
      'create-programme-child',
      `Creating temporary sub-project ${childProjectName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(companyId)}/projects`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: childProjectId,
              name: childProjectName,
              projectType: 'project',
              parentProjectId: programmeId,
              currency: 'AUD',
              initialOwnerUserId,
            }),
          }
        );
        assertOk(result, 'create programme child project');
        const child = parseBody(
          projectResponseSchema,
          result.body,
          'create programme child project'
        );
        if (child.parentProjectId !== programmeId) {
          throw new Error('Sub-project did not link to programme.');
        }
        childCreated = true;
      }
    );

    await recorder.step(
      'programme-child-budget-total',
      `Setting total budget on ${childProjectName}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ budgetTotalCents: 50000 }),
          }
        );
        assertOk(result, 'set programme child budget total');
      }
    );

    await recorder.step(
      'programme-child-taxonomy',
      `Creating taxonomy for ${childProjectName}`,
      async () => {
        const categoryResult = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}/categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: categoryId,
              companyId,
              projectId: childProjectId,
              name: uniqueId('Programme Smoke Category'),
            }),
          }
        );
        assertOk(categoryResult, 'create programme child category');

        const subCategoryResult = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}/sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: subCategoryId,
              companyId,
              projectId: childProjectId,
              categoryId,
              name: uniqueId('Programme Smoke Subcategory'),
            }),
          }
        );
        assertOk(subCategoryResult, 'create programme child subcategory');
      }
    );

    await recorder.step(
      'programme-child-transaction',
      `Creating coded transaction for ${childProjectName}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(childProjectId)}/transactions`,
          {
            method: 'POST',
            body: JSON.stringify({
              txn: {
                id: txnId,
                companyId,
                projectId: childProjectId,
                date: '2026-05-06',
                item: 'Programme smoke transaction',
                description: 'Programme rollup verification',
                amountCents: 12500,
                categoryId,
                subCategoryId,
                codingSource: 'manual',
              },
            }),
          }
        );
        assertOk(result, 'create programme child transaction');
      }
    );

    await recorder.step(
      'programme-summary-rollup',
      `Checking programme rollup for ${programmeName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(companyId)}/summary`
        );
        assertOk(result, 'programme company summary');
        const summary = parseBody(
          companySummaryResponseSchema,
          result.body,
          'programme company summary'
        );
        const programme = summary.projects.find(
          (project) => project.id === programmeId
        );
        if (!programme) throw new Error('Programme was missing from summary.');
        if (programme.budgetCents !== 50000) {
          throw new Error('Programme did not roll up child project budget.');
        }
        if (programme.children?.[0]?.id !== childProjectId) {
          throw new Error('Programme did not include child project row.');
        }
        if (programme.months[0]?.actualCodedCents !== 12500) {
          throw new Error('Programme did not roll up child coded actuals.');
        }
      }
    );

    await recorder.step(
      'programme-operational-guard',
      `Checking programme ${programmeName} rejects operational endpoints`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(programmeId)}/budgets`
        );
        if (result.res.status !== 422) {
          throw new Error(
            `Expected programme budget endpoint to reject with 422, got ${result.res.status}.`
          );
        }
      }
    );
  } finally {
    if (childCreated) {
      await client.request(
        `/api/projects/${encodeURIComponent(childProjectId)}/deactivate`,
        { method: 'POST' }
      );
      await client.request(
        `/api/projects/${encodeURIComponent(childProjectId)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ confirmation: `DELETE ${childProjectName}` }),
        }
      );
    }
    if (programmeCreated) {
      await client.request(
        `/api/projects/${encodeURIComponent(programmeId)}/deactivate`,
        { method: 'POST' }
      );
      await client.request(`/api/projects/${encodeURIComponent(programmeId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: `DELETE ${programmeName}` }),
      });
    }
  }
}

async function runCompanyDefaultsSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company, project } = await loadPrimaryCompanyAndProject(
    recorder,
    client
  );
  const defaultCategoryId = uniqueId('ccat_smoke');
  const preferredDefaultSubCategoryId = uniqueId('csub_smoke_preferred');
  const fallbackDefaultSubCategoryId = uniqueId('csub_smoke_fallback');
  const preferredMappingRuleId = uniqueId('cmap_smoke_preferred');
  const fallbackMappingRuleId = uniqueId('cmap_smoke_fallback');
  const categoryName = uniqueId('Smoke Transport');
  const preferredSubCategoryName = uniqueId('Smoke Flights Preferred');
  const fallbackSubCategoryName = uniqueId('Smoke Flights Fallback');
  const preferredMatchText = uniqueId('smoke flight match');
  const fallbackMatchText = preferredMatchText
    .split(' ')
    .slice(0, -1)
    .join(' ');
  const txnId = uniqueId('txn_smoke_defaults');
  const txnExternalId = uniqueId('external_smoke_defaults');

  let projectCategoryId: string | null = null;
  let projectPreferredSubCategoryId: string | null = null;
  let importedTxnId: string | null = null;
  let budgetId: string | null = null;
  let createdDefaultCategory = false;
  let createdPreferredDefaultSubCategory = false;
  let createdFallbackDefaultSubCategory = false;
  let createdPreferredDefaultMapping = false;
  let createdFallbackDefaultMapping = false;

  try {
    await recorder.step(
      'create-default-category',
      `Creating company default category ${categoryName}`,
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: defaultCategoryId,
              companyId: company.id,
              name: categoryName,
            }),
          }
        );
        assertOk(result, 'create company default category');
        createdDefaultCategory = true;
      }
    );

    await recorder.step(
      'create-default-subcategory',
      `Creating company default subcategories ${preferredSubCategoryName} and ${fallbackSubCategoryName}`,
      async () => {
        const preferredResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: preferredDefaultSubCategoryId,
              companyId: company.id,
              companyDefaultCategoryId: defaultCategoryId,
              name: preferredSubCategoryName,
            }),
          }
        );
        assertOk(
          preferredResult,
          'create preferred company default subcategory'
        );
        createdPreferredDefaultSubCategory = true;

        const fallbackResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: fallbackDefaultSubCategoryId,
              companyId: company.id,
              companyDefaultCategoryId: defaultCategoryId,
              name: fallbackSubCategoryName,
            }),
          }
        );
        assertOk(fallbackResult, 'create fallback company default subcategory');
        createdFallbackDefaultSubCategory = true;
      }
    );

    await recorder.step(
      'create-default-mapping',
      `Creating overlapping company default mapping rules for ${preferredMatchText}`,
      async () => {
        const preferredResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: preferredMappingRuleId,
              companyId: company.id,
              matchText: preferredMatchText,
              companyDefaultCategoryId: defaultCategoryId,
              companyDefaultSubCategoryId: preferredDefaultSubCategoryId,
              sortOrder: 999998,
            }),
          }
        );
        assertOk(
          preferredResult,
          'create preferred company default mapping rule'
        );
        createdPreferredDefaultMapping = true;

        const fallbackResult = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules`,
          {
            method: 'POST',
            body: JSON.stringify({
              id: fallbackMappingRuleId,
              companyId: company.id,
              matchText: fallbackMatchText,
              companyDefaultCategoryId: defaultCategoryId,
              companyDefaultSubCategoryId: fallbackDefaultSubCategoryId,
              sortOrder: 999999,
            }),
          }
        );
        assertOk(
          fallbackResult,
          'create fallback company default mapping rule'
        );
        createdFallbackDefaultMapping = true;
      }
    );

    await recorder.step(
      'apply-company-defaults',
      'Applying company defaults to the project',
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/apply-company-default-taxonomy`,
          { method: 'POST' }
        );
        assertOk(result, 'apply company defaults');
        const body = parseBody(
          applyCompanyDefaultsResultResponseSchema,
          result.body,
          'apply company defaults'
        );
        if (!body.companyDefaultsConfigured) {
          throw new Error(
            'Company defaults were not reported as configured during apply.'
          );
        }
      }
    );

    await recorder.step(
      'import-mapped-transaction',
      `Importing a matching uncoded transaction for ${preferredMatchText}`,
      async () => {
        const result = await client.request(
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
      }
    );

    await recorder.step(
      'verify-auto-mapped',
      'Verifying the imported transaction was auto-mapped',
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`
        );
        assertOk(result, 'list imported transactions');
        const txns = parseBody(
          txnsResponseSchema,
          result.body,
          'list imported transactions'
        );
        const imported = txns.find(
          (txn) => txn.id === txnId || txn.externalId === txnExternalId
        );
        if (!imported)
          throw new Error('Imported smoke transaction was not found.');
        if (!imported.categoryId || !imported.subCategoryId) {
          throw new Error(
            'Imported smoke transaction was not coded by company defaults.'
          );
        }
        if (!imported.codingPendingApproval) {
          throw new Error(
            'Imported smoke transaction was not marked pending approval.'
          );
        }
        importedTxnId = String(imported.id);

        const categoriesResult = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/categories`
        );
        assertOk(categoriesResult, 'list project categories after apply');
        const projectCategories = parseBody(
          categoriesResponseSchema,
          categoriesResult.body,
          'list project categories after apply'
        );
        projectCategoryId =
          projectCategories.find((category) => category.name === categoryName)
            ?.id ?? null;
        if (!projectCategoryId) {
          throw new Error(
            `Applied project category ${categoryName} was not found.`
          );
        }

        const subCategoriesResult = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/sub-categories`
        );
        assertOk(subCategoriesResult, 'list project subcategories after apply');
        const projectSubCategories = parseBody(
          subCategoriesResponseSchema,
          subCategoriesResult.body,
          'list project subcategories after apply'
        );
        projectPreferredSubCategoryId =
          projectSubCategories.find(
            (subCategory) =>
              subCategory.name === preferredSubCategoryName &&
              subCategory.categoryId === projectCategoryId
          )?.id ?? null;
        if (!projectPreferredSubCategoryId) {
          throw new Error(
            `Applied project subcategory ${preferredSubCategoryName} was not found.`
          );
        }
      }
    );

    await recorder.step(
      'verify-rule-ordering',
      'Verifying the higher-priority mapping rule won',
      async () => {
        if (!importedTxnId)
          throw new Error(
            'No imported transaction id available for rule-ordering verification.'
          );
        if (!projectPreferredSubCategoryId) {
          throw new Error(
            'No preferred project subcategory id available for rule-ordering verification.'
          );
        }
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`
        );
        assertOk(
          result,
          'list imported transactions for rule-ordering verification'
        );
        const txns = parseBody(
          txnsResponseSchema,
          result.body,
          'list imported transactions for rule-ordering verification'
        );
        const imported = txns.find((txn) => String(txn.id) === importedTxnId);
        if (!imported) {
          throw new Error(
            'Imported smoke transaction was not found for rule-ordering verification.'
          );
        }
        if (
          String(imported.subCategoryId ?? '') !== projectPreferredSubCategoryId
        ) {
          throw new Error(
            `Expected higher-priority mapping to target ${preferredSubCategoryName}, but it mapped elsewhere.`
          );
        }
      }
    );

    await recorder.step(
      'approve-auto-mapped',
      'Approving the auto-mapped transaction',
      async () => {
        if (!importedTxnId)
          throw new Error('No imported transaction id available for approval.');
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              txn: {
                id: importedTxnId,
                codingPendingApproval: false,
              },
            }),
          }
        );
        assertOk(result, 'approve auto-mapped transaction');
        const approved = parseBody(
          txnResponseSchema,
          result.body,
          'approve auto-mapped transaction'
        );
        if (!approved.categoryId || !approved.subCategoryId) {
          throw new Error('Approved transaction lost its coding.');
        }
        if (approved.codingPendingApproval) {
          throw new Error('Approved transaction still shows pending approval.');
        }
      }
    );

    await recorder.step(
      'verify-budget-line',
      `Verifying budget line exists for ${preferredSubCategoryName}`,
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets`
        );
        assertOk(result, 'list project budgets');
        const budgets = parseBody(
          budgetLinesResponseSchema,
          result.body,
          'list project budgets'
        );
        const subCategoriesResult = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/sub-categories`
        );
        assertOk(subCategoriesResult, 'list project subcategories');
        const projectSubCategories = parseBody(
          subCategoriesResponseSchema,
          subCategoriesResult.body,
          'list project subcategories'
        );
        const projectSubCategory = projectSubCategories.find(
          (subCategory) =>
            subCategory.name === preferredSubCategoryName &&
            subCategory.categoryId === projectCategoryId
        );
        if (!projectSubCategory) {
          throw new Error(
            `Applied project subcategory ${preferredSubCategoryName} was not found.`
          );
        }
        const matchingBudget = budgets.find(
          (entry) =>
            entry.subCategoryId === projectSubCategory.id &&
            entry.categoryId === projectCategoryId
        );
        if (!matchingBudget) {
          throw new Error(
            `No budget line existed for ${preferredSubCategoryName} after import.`
          );
        }
        budgetId = String(matchingBudget.id);
      }
    );
  } finally {
    await recorder.step(
      'cleanup-imported-transaction',
      'Deleting the imported transaction',
      async () => {
        if (!importedTxnId) return;
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/transactions/${encodeURIComponent(importedTxnId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete imported smoke transaction');
      }
    );
    await recorder.step(
      'cleanup-budget-line',
      'Deleting the temporary budget line',
      async () => {
        if (!budgetId) return;
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/budgets/${encodeURIComponent(budgetId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary smoke budget');
      }
    );
    await recorder.step(
      'cleanup-project-category',
      'Deleting the temporary project category',
      async () => {
        if (!projectCategoryId) return;
        const result = await client.request(
          `/api/projects/${encodeURIComponent(project.id)}/categories/${encodeURIComponent(projectCategoryId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary smoke project category');
      }
    );
    await recorder.step(
      'cleanup-default-mapping',
      'Deleting the temporary company default mapping rule',
      async () => {
        if (createdPreferredDefaultMapping) {
          const preferredResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules/${encodeURIComponent(preferredMappingRuleId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            preferredResult,
            'delete preferred temporary company default mapping rule'
          );
        }
        if (createdFallbackDefaultMapping) {
          const fallbackResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-mapping-rules/${encodeURIComponent(fallbackMappingRuleId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            fallbackResult,
            'delete fallback temporary company default mapping rule'
          );
        }
      }
    );
    await recorder.step(
      'cleanup-default-subcategory',
      'Deleting the temporary company default subcategory',
      async () => {
        if (createdPreferredDefaultSubCategory) {
          const preferredResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories/${encodeURIComponent(preferredDefaultSubCategoryId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            preferredResult,
            'delete preferred temporary company default subcategory'
          );
        }
        if (createdFallbackDefaultSubCategory) {
          const fallbackResult = await client.request(
            `/api/companies/${encodeURIComponent(company.id)}/default-sub-categories/${encodeURIComponent(fallbackDefaultSubCategoryId)}`,
            { method: 'DELETE' }
          );
          assertOk(
            fallbackResult,
            'delete fallback temporary company default subcategory'
          );
        }
      }
    );
    await recorder.step(
      'cleanup-default-category',
      'Deleting the temporary company default category',
      async () => {
        if (!createdDefaultCategory) return;
        const result = await client.request(
          `/api/companies/${encodeURIComponent(company.id)}/default-categories/${encodeURIComponent(defaultCategoryId)}`,
          { method: 'DELETE' }
        );
        assertOk(result, 'delete temporary company default category');
      }
    );
  }
}

async function runInviteFlowSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  loadSmokeEnvFiles();
  const inviteEmail = process.env.PROJEX_SMOKE_INVITE_EMAIL?.trim();
  const inviteName =
    process.env.PROJEX_SMOKE_INVITE_NAME?.trim() || 'Smoke Invite';
  const inviteRole = process.env.PROJEX_SMOKE_INVITE_ROLE?.trim() || 'member';
  const followUpRole =
    inviteRole === 'member'
      ? 'management'
      : inviteRole === 'management'
        ? 'executive'
        : 'member';

  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company } = await loadPrimaryCompanyAndProject(recorder, client);

  if (!inviteEmail) {
    recorder.skip(
      'invite-flow-skipped',
      'Skipping invite flow',
      'Set PROJEX_SMOKE_INVITE_EMAIL in .env.smoke.local to enable this section.'
    );
    return;
  }

  const invite = await recorder.step(
    'invite-user',
    `Inviting ${inviteEmail} to company ${companyLabel(company)} as ${inviteRole}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/users`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: inviteName,
            email: inviteEmail,
            role: inviteRole,
          }),
        }
      );
      assertOk(result, 'invite user');
      const body = parseBody(
        companyUserInviteResultResponseSchema,
        result.body,
        'invite user'
      );
      if (!body.onboardingEmailSent) {
        throw new Error(
          'Brand-new invited user did not trigger an onboarding email.'
        );
      }
      if (!body.membershipCreated) {
        throw new Error(
          'Brand-new invited user did not create a company membership.'
        );
      }
      return body;
    }
  );

  const invitedUserId = invite?.user?.id;
  if (!invitedUserId) {
    throw new Error(
      `Invite user did not return a user id: ${JSON.stringify(invite)}`
    );
  }

  await authenticatePrimaryUser(recorder, client, baseUrl);

  await recorder.step(
    'update-existing-member',
    `Updating existing member ${inviteEmail} to role ${followUpRole} without sending email`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/users`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: inviteName,
            email: inviteEmail,
            role: followUpRole,
            sendOnboardingEmail: false,
          }),
        }
      );
      assertOk(result, 'update existing member');
      const body = parseBody(
        companyUserInviteResultResponseSchema,
        result.body,
        'update existing member'
      );
      if (body.user?.id !== invitedUserId) {
        throw new Error(
          `Existing member update returned a different user id: ${JSON.stringify(body)}`
        );
      }
      if (body.onboardingEmailSent) {
        throw new Error(
          'Existing member update unexpectedly sent an onboarding email.'
        );
      }
      if (body.membershipCreated) {
        throw new Error(
          'Existing member update unexpectedly reported a new membership.'
        );
      }
    }
  );

  await recorder.step(
    'resend-invite',
    `Attempting immediate resend for invited user ${inviteEmail}`,
    async () => {
      const resend = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/users/${encodeURIComponent(invitedUserId)}/invite`,
        { method: 'POST' }
      );
      if (isInviteResendRateLimited(resend)) return;
      assertOk(resend, 'resend invite');
    }
  );
}

async function runExportFlowSection(
  recorder: Recorder,
  client: SmokeHttpClient,
  baseUrl: string
) {
  await authenticatePrimaryUser(recorder, client, baseUrl);
  const { company } = await loadPrimaryCompanyAndProject(recorder, client);

  const exportJob = await recorder.step(
    'start-export',
    `Starting export for company ${companyLabel(company)}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(company.id)}/export-jobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            scope: 'all',
            detail: 'full',
            notifyWhenReady: false,
          }),
        }
      );
      if (result.res.status !== 202) {
        throw new Error(
          `Expected export job creation to return 202, got ${result.res.status}.`
        );
      }
      return parseBody(
        companyExportJobResponseSchema,
        result.body,
        'start export job'
      );
    }
  );

  const completedJob = await recorder.step(
    'poll-export',
    `Waiting for export job ${exportJob.id} to complete`,
    async () => {
      const maxAttempts = 45;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await client.request(
          `/api/export-jobs/${encodeURIComponent(exportJob.id)}`
        );
        assertOk(result, 'poll export job');
        const job = parseBody(
          companyExportJobResponseSchema,
          result.body,
          'poll export job'
        );

        if (job.status === 'completed') {
          if (!job.downloadPath) {
            throw new Error('Completed export job did not include a download.');
          }
          if (!job.fileName) {
            throw new Error(
              'Completed export job did not include a file name.'
            );
          }
          if (typeof job.fileSizeBytes !== 'number' || job.fileSizeBytes <= 0) {
            throw new Error(
              'Completed export job did not include a positive file size.'
            );
          }
          return job;
        }

        if (job.status === 'failed') {
          throw new Error(job.errorMessage ?? 'Export job failed.');
        }

        if (job.status === 'expired') {
          throw new Error('Export job expired before smoke download.');
        }

        if (attempt === maxAttempts) {
          throw new Error(
            `Export job ${exportJob.id} did not complete within ${(maxAttempts * 2).toString()} seconds.`
          );
        }

        await sleep(2000);
      }

      throw new Error(`Export job ${exportJob.id} did not complete.`);
    }
  );

  await recorder.step(
    'download-export',
    `Downloading workbook ${completedJob.fileName ?? completedJob.id}`,
    async () => {
      const result = await client.requestBinary(
        completedJob.downloadPath ??
          `/api/export-jobs/${encodeURIComponent(completedJob.id)}/download`
      );
      if (!result.res.ok) {
        throw new Error(`Download failed with ${result.res.status}.`);
      }
      const contentType = result.res.headers.get('content-type') ?? '';
      if (
        !contentType.includes(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      ) {
        throw new Error(
          `Unexpected export content type: ${contentType || 'missing'}.`
        );
      }
      const contentDisposition =
        result.res.headers.get('content-disposition') ?? '';
      if (!contentDisposition.includes('attachment;')) {
        throw new Error('Export download was missing attachment headers.');
      }
      const bytes = result.bytes;
      if (bytes.byteLength < 4) {
        throw new Error('Downloaded workbook was unexpectedly small.');
      }
      if (
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4b ||
        bytes[2] !== 0x03 ||
        bytes[3] !== 0x04
      ) {
        throw new Error('Downloaded workbook did not look like an XLSX zip.');
      }
      if (
        typeof completedJob.fileSizeBytes === 'number' &&
        completedJob.fileSizeBytes !== bytes.byteLength
      ) {
        throw new Error(
          `Downloaded workbook size ${bytes.byteLength} did not match recorded size ${completedJob.fileSizeBytes}.`
        );
      }
    }
  );
}

async function runPrivacyChecksSection(
  recorder: Recorder,
  client: SmokeHttpClient
) {
  loadSmokeEnvFiles();
  const privacyAdminEmail =
    process.env.PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL?.trim();
  const privacyAdminPassword =
    process.env.PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD?.trim();
  const privacySuperadminEmail =
    process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL?.trim();
  const privacySuperadminPassword =
    process.env.PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD?.trim();

  if (
    !privacyAdminEmail ||
    !privacyAdminPassword ||
    !privacySuperadminEmail ||
    !privacySuperadminPassword
  ) {
    recorder.skip(
      'privacy-skipped',
      'Skipping privacy toggle flow',
      'Set PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL, PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD, PROJEX_SMOKE_PRIVACY_SUPERADMIN_EMAIL, and PROJEX_SMOKE_PRIVACY_SUPERADMIN_PASSWORD in .env.smoke.local to enable this section.'
    );
    return;
  }

  await recorder.step(
    'privacy-admin-login',
    `Logging in as admin ${userLabel(privacyAdminEmail, 'admin')}`,
    async () => {
      await client.loginWithEmailPassword(
        privacyAdminEmail,
        privacyAdminPassword,
        'privacy admin login'
      );
    }
  );

  const adminCompanies = await recorder.step(
    'privacy-admin-companies',
    'Loading admin companies',
    async () => {
      const result = await client.request('/api/companies');
      assertOk(result, 'privacy admin companies');
      return parseBody(
        companiesResponseSchema,
        result.body,
        'privacy admin companies'
      );
    }
  );
  const adminCompany = adminCompanies[0];
  if (!adminCompany?.id)
    throw new Error('No company available for privacy admin smoke test');

  const adminProjects = await recorder.step(
    'privacy-admin-projects',
    `Loading admin projects for company ${companyLabel(adminCompany)}`,
    async () => {
      const result = await client.request(
        `/api/companies/${encodeURIComponent(adminCompany.id)}/projects`
      );
      assertOk(result, 'privacy admin projects');
      return parseBody(
        projectsResponseSchema,
        result.body,
        'privacy admin projects'
      );
    }
  );
  const adminProject =
    adminProjects.find((candidate) => candidate.status === 'active') ??
    adminProjects[0];
  if (!adminProject?.id)
    throw new Error('No project available for privacy admin smoke test');
  const originalAccess = Boolean(adminProject.allowSuperadminAccess);

  try {
    await recorder.step(
      'privacy-enable-access',
      `Enabling superadmin access for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await client.request(
            `/api/projects/${encodeURIComponent(adminProject.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ allowSuperadminAccess: true }),
            }
          ),
          'privacy enable superadmin access'
        );
      }
    );
    await recorder.step(
      'privacy-disable-access',
      `Disabling superadmin access for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await client.request(
            `/api/projects/${encodeURIComponent(adminProject.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ allowSuperadminAccess: false }),
            }
          ),
          'privacy disable superadmin access'
        );
      }
    );
    await recorder.step(
      'privacy-admin-page',
      'Confirming admin can still view the project page',
      async () => {
        assertHtmlOk(
          await client.requestHtml(
            `/c/${encodeURIComponent(adminCompany.id)}/p/${encodeURIComponent(adminProject.id)}`
          ),
          'privacy admin project page after disable'
        );
      }
    );

    await client.request('/api/session', { method: 'DELETE' });
    await sleep(1000);

    await recorder.step(
      'privacy-superadmin-login',
      `Logging in as superadmin ${userLabel(privacySuperadminEmail, 'superadmin')}`,
      async () => {
        await client.loginWithEmailPassword(
          privacySuperadminEmail,
          privacySuperadminPassword,
          'privacy superadmin login'
        );
      }
    );

    const superProjects = await recorder.step(
      'privacy-superadmin-list',
      'Checking restricted project is hidden from superadmin project list',
      async () => {
        const result = await client.request(
          `/api/companies/${encodeURIComponent(adminCompany.id)}/projects`
        );
        assertOk(result, 'privacy superadmin projects');
        return parseBody(
          projectsResponseSchema,
          result.body,
          'privacy superadmin projects'
        );
      }
    );
    if (superProjects.some((project) => project.id === adminProject.id)) {
      throw new Error('Restricted project was still visible to superadmin');
    }

    const superProject = await recorder.step(
      'privacy-superadmin-fetch',
      'Checking restricted project cannot be fetched by superadmin',
      async () => {
        const result = await client.request(
          `/api/projects/${encodeURIComponent(adminProject.id)}`
        );
        assertOk(result, 'privacy superadmin project fetch');
        return parseBody(
          projectResponseSchema.nullable(),
          result.body,
          'privacy superadmin project fetch'
        );
      }
    );
    if (superProject !== null) {
      throw new Error('Restricted project still resolved for superadmin');
    }
  } finally {
    await client.request('/api/session', { method: 'DELETE' });
    await sleep(1000);
    await recorder.step(
      'privacy-admin-relogin',
      `Relogging in as admin ${userLabel(privacyAdminEmail, 'admin')}`,
      async () => {
        await client.loginWithEmailPassword(
          privacyAdminEmail,
          privacyAdminPassword,
          'privacy admin relogin'
        );
      }
    );
    await recorder.step(
      'privacy-restore',
      `Restoring original superadmin access (${String(originalAccess)}) for project ${projectLabel(adminProject)}`,
      async () => {
        assertOk(
          await client.request(
            `/api/projects/${encodeURIComponent(adminProject.id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ allowSuperadminAccess: originalAccess }),
            }
          ),
          'privacy restore superadmin access'
        );
      }
    );
  }
}

export async function runSmokeSection(
  sectionId: SmokeSectionId,
  requestOrigin: string,
  options?: RunSmokeSectionOptions
) {
  const baseUrl = getSmokeRequestBaseUrl(requestOrigin);
  const client = new SmokeHttpClient(baseUrl, options?.onStatus);

  return withRecorder(
    sectionId,
    async (recorder) => {
      switch (sectionId) {
        case 'basics':
          await runBasicsSection(recorder, client, baseUrl);
          return;
        case 'appPages':
          await runAppPagesSection(recorder, client, baseUrl);
          return;
        case 'emailChange':
          await runEmailChangeSection(recorder, client, baseUrl);
          return;
        case 'temporaryData':
          await runTemporaryDataSection(recorder, client, baseUrl);
          return;
        case 'companyDefaults':
          await runCompanyDefaultsSection(recorder, client, baseUrl);
          return;
        case 'inviteFlow':
          await runInviteFlowSection(recorder, client, baseUrl);
          return;
        case 'exportFlow':
          await runExportFlowSection(recorder, client, baseUrl);
          return;
        case 'privacyChecks':
          await runPrivacyChecksSection(recorder, client);
          return;
        default:
          throw new Error(`Unknown smoke section: ${String(sectionId)}`);
      }
    },
    options
  );
}
