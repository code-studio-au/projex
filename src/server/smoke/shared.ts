import { z } from 'zod';

import type {
  SmokeSectionId,
  SmokeSectionResult,
  SmokeStepResult,
} from '../../types/smoke.ts';
import { smokeSectionDefinitions } from '../../types/smoke.ts';
import { parseJsonOrText } from '../../utils/json.ts';
import {
  apiMessageResponseSchema,
  authenticatedSessionResponseSchema,
  companiesResponseSchema,
  companyMembershipsResponseSchema,
  projectsResponseSchema,
  usersResponseSchema,
} from '../../validation/responseSchemas.ts';
import { getSmokeRequestBaseUrl, loadSmokeEnvFiles } from './env.ts';

const smokeSectionMap = new Map(
  smokeSectionDefinitions.map((section) => [section.id, section])
);

export type HttpResult = {
  res: Response;
  body: unknown;
};

type Retry429Options = {
  label: string;
  backoffsMs?: number[];
};

const defaultRateLimitBackoffsMs = [1500, 3000, 5000, 10000, 15000];
const disabledSignUpResponseSchema = z.object({
  code: z.literal('EMAIL_PASSWORD_SIGN_UP_DISABLED'),
  message: z.string(),
});

export type Recorder = {
  step<T>(id: string, label: string, fn: () => Promise<T>): Promise<T>;
  skip(id: string, label: string, detail: string): void;
};

export type RunSmokeSectionOptions = {
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
};

export function uniqueId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function companyLabel(company: SmokeCompany | null | undefined) {
  if (!company) return 'unknown company';
  return company.name || company.id || 'unknown company';
}

export function projectLabel(project: SmokeProject | null | undefined) {
  if (!project) return 'unknown project';
  return project.name || project.id || 'unknown project';
}

export function userLabel(email: string | undefined, fallbackRole: string) {
  return email || fallbackRole;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSequentially<T>(
  items: readonly T[],
  visit: (item: T, index: number) => Promise<void>,
  index = 0
): Promise<void> {
  if (index >= items.length) return;
  await visit(items[index], index);
  return runSequentially(items, visit, index + 1);
}

export function getRetryDelayMs(
  response: Response,
  fallbackMs: number
): number {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (!retryAfter) return fallbackMs;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.max(fallbackMs, Math.ceil(retryAfterSeconds * 1000));
  }

  const retryAtMs = Date.parse(retryAfter);
  if (!Number.isFinite(retryAtMs)) return fallbackMs;

  return Math.max(fallbackMs, retryAtMs - Date.now());
}

export function assertOk(result: HttpResult | null, label: string) {
  if (result?.res.ok) return;
  throw new Error(
    `${label} failed: ${result?.res.status ?? 'unknown'} ${JSON.stringify(result?.body ?? null)}`
  );
}

export function assertHtmlOk(
  result: { res: Response; body: string },
  label: string
) {
  if (!result.res.ok) throw new Error(`${label} failed: ${result.res.status}`);
  const contentType = result.res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(
      `${label} did not return HTML (${contentType || 'no content-type'})`
    );
  }
}

export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  label: string
): T {
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

export function isInviteResendRateLimited(result: HttpResult) {
  if (result.res.ok) return false;
  if (result.res.status !== 500) return false;
  const message = extractApiMessage(result.body);
  return message.includes('Too many requests');
}

export class SmokeHttpClient {
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
    if (!headers.has('x-real-ip')) headers.set('x-real-ip', '127.0.0.1');
    if (!headers.has('content-type') && init.body) {
      headers.set('content-type', 'application/json');
    }

    const res = await fetch(`${this.baseUrl}${urlPath}`, { ...init, headers });
    this.storeSetCookie(res.headers);
    if (!res.ok) {
      const text = await res.text();
      return { res, body: parseJsonOrText(text) };
    }
    const text = await res.text();
    const body = parseJsonOrText(text);
    return { res, body };
  }

  async requestWith429Retry(
    urlPath: string,
    init: RequestInit = {},
    options: Retry429Options
  ): Promise<HttpResult> {
    const backoffsMs = options.backoffsMs ?? defaultRateLimitBackoffsMs;
    let result: HttpResult | null = null;
    for (let attempt = 0; attempt <= backoffsMs.length; attempt += 1) {
      result = await this.request(urlPath, init);
      if (result.res.status !== 429) break;
      if (attempt === backoffsMs.length) break;
      const retryDelayMs = getRetryDelayMs(result.res, backoffsMs[attempt]);
      await this.emitStatus(
        `${options.label} was rate-limited. Retrying in ${(retryDelayMs / 1000).toFixed(1)}s.`
      );
      await sleep(retryDelayMs);
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
    if (!headers.has('x-real-ip')) headers.set('x-real-ip', '127.0.0.1');
    const res = await fetch(`${this.baseUrl}${urlPath}`, { ...init, headers });
    this.storeSetCookie(res.headers);
    if (!res.ok) {
      return { res, body: await res.text() };
    }
    const body = await res.text();
    return { res, body };
  }

  async requestBinary(urlPath: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (!headers.has('origin')) headers.set('origin', this.baseUrl);
    if (!headers.has('referer')) headers.set('referer', `${this.baseUrl}/`);
    if (!headers.has('x-real-ip')) headers.set('x-real-ip', '127.0.0.1');
    const res = await fetch(`${this.baseUrl}${urlPath}`, { ...init, headers });
    this.storeSetCookie(res.headers);
    if (!res.ok) {
      return {
        res,
        bytes: new Uint8Array(await res.arrayBuffer()),
      };
    }
    return {
      res,
      bytes: new Uint8Array(await res.arrayBuffer()),
    };
  }

  async loginWithEmailPassword(email: string, password: string, label: string) {
    this.resetCookies();
    const backoffsMs = defaultRateLimitBackoffsMs;
    let login: HttpResult | null = null;
    for (let attempt = 0; attempt <= backoffsMs.length; attempt += 1) {
      login = await this.request('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (login.res.status !== 429) break;
      if (attempt === backoffsMs.length) break;
      const retryDelayMs = getRetryDelayMs(login.res, backoffsMs[attempt]);
      await this.emitStatus(
        `${label} was rate-limited. Retrying in ${(retryDelayMs / 1000).toFixed(1)}s.`
      );
      await sleep(retryDelayMs);
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

export async function withRecorder(
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

export async function authenticatePrimaryUser(
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

export async function assertPublicSignUpDisabled(
  recorder: Recorder,
  client: SmokeHttpClient
) {
  loadSmokeEnvFiles();
  const email = process.env.PROJEX_SMOKE_EMAIL?.trim();
  const password = process.env.PROJEX_SMOKE_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      'Public sign-up verification requires the configured smoke user credentials.'
    );
  }

  await recorder.step(
    'auth-sign-up-disabled',
    'Checking public email/password sign-up is disabled',
    async () => {
      const result = await client.request('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          name: 'Public sign-up probe',
        }),
      });
      if (result.res.status !== 400) {
        throw new Error(
          `public sign-up returned ${result.res.status}; expected 400`
        );
      }
      parseBody(
        disabledSignUpResponseSchema,
        result.body,
        'public sign-up rejection'
      );
    }
  );
}

export async function loadPrimaryCompanyAndProject(
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

export async function selectInitialProjectOwnerUserId(
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

export function getSmokeClient(
  requestOrigin: string,
  options?: RunSmokeSectionOptions
) {
  const baseUrl = getSmokeRequestBaseUrl(requestOrigin);
  const client = new SmokeHttpClient(baseUrl, options?.onStatus);
  return { baseUrl, client };
}
