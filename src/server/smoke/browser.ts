import { chromium } from 'playwright';

import {
  cleanupSmokeFixtures,
  createSmokeFixtures,
  sweepSmokeFixtures,
  type SmokeFixtures,
} from './fixtures.ts';
import { getSmokeConfiguredBaseUrl } from './env.ts';

type BrowserSmokeOptions = {
  onStatus?: (message: string) => void | Promise<void>;
};

function parseRequestedSections(argv: string[]) {
  const sections = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--section') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value after --section');
      sections.add(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--section=')) {
      sections.add(arg.slice('--section='.length));
    }
  }

  return sections;
}

function hasFlag(argv: string[], flag: string) {
  return argv.includes(flag);
}

async function emit(
  options: BrowserSmokeOptions,
  message: string
): Promise<void> {
  await options.onStatus?.(message);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for browser smoke`);
  }
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyCsp(html: string, csp: string | undefined) {
  assert(csp, 'Missing Content-Security-Policy header on login page');
  assert(
    csp.includes("script-src 'nonce-"),
    'Login page CSP is missing a nonce-based script-src directive'
  );

  const metaNonce = /<meta property="csp-nonce" content="([^"]+)"/i.exec(
    html
  )?.[1];
  assert(metaNonce, 'Login page is missing the csp-nonce meta tag');
  assert(
    csp.includes(`nonce-${metaNonce}`),
    'Login page CSP nonce does not match the HTML nonce'
  );
}

async function waitForLocation(
  page: import('playwright').Page,
  predicate: (location: { pathname: string; search: string }) => boolean,
  message: string
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const current = await page.evaluate<{
      pathname: string;
      search: string;
    }>(() => {
      const browserGlobal = globalThis as unknown as {
        location: { pathname: string; search: string };
      };
      return {
        pathname: browserGlobal.location.pathname,
        search: browserGlobal.location.search,
      };
    });
    if (predicate(current)) {
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${message}. Current URL: ${page.url()}`);
}

async function waitForTabSelection(
  page: import('playwright').Page,
  name: string,
  message: string
) {
  const tab = page.getByRole('tab', { name });
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15_000) {
    if ((await tab.getAttribute('aria-selected')) === 'true') {
      return;
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`${message}. Current URL: ${page.url()}`);
}

async function runBrowserSmoke(baseUrl: string, options: BrowserSmokeOptions) {
  const companyId = requireEnv('PROJEX_SMOKE_COMPANY_ID');
  const projectId = requireEnv('PROJEX_SMOKE_PROJECT_ID');
  const email = requireEnv('PROJEX_SMOKE_PRIVACY_ADMIN_EMAIL');
  const password = requireEnv('PROJEX_SMOKE_PRIVACY_ADMIN_PASSWORD');
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  let browser;
  try {
    browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message.includes("Executable doesn't exist")
        ? 'Playwright Chromium is not installed. Run `pnpm exec playwright install chromium` first.'
        : message
    );
  }

  try {
    const context = await browser.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: { 'x-real-ip': '127.0.0.1' },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });

    await emit(options, 'Opening login page');
    const loginResponse = await page.goto('/login', {
      waitUntil: 'domcontentloaded',
    });
    assert(loginResponse?.ok(), 'Login page did not load successfully');
    const loginHtml = await page.content();
    verifyCsp(loginHtml, loginResponse?.headers()['content-security-policy']);
    await emit(options, 'Signing in through the browser session');
    const signInResponse = await context.request.post(
      `${baseUrl}/api/auth/sign-in/email`,
      {
        data: { email, password },
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/login`,
        },
      }
    );
    assert(signInResponse.ok(), 'Browser-context sign-in request failed');

    await page.goto(`/c/${companyId}?tab=projects`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForLocation(
      page,
      ({ pathname, search }) =>
        pathname === `/c/${companyId}` &&
        new URLSearchParams(search).get('tab') === 'projects',
      'Company dashboard did not open on the projects tab'
    );
    await waitForTabSelection(
      page,
      'Projects & programmes',
      'Company dashboard did not select the projects tab'
    );
    await waitForLocation(
      page,
      ({ pathname, search }) =>
        pathname === `/c/${companyId}` &&
        new URLSearchParams(search).get('tab') === 'projects',
      'Company dashboard did not keep the projects tab selected'
    );

    await emit(options, 'Opening the generated project workspace');
    await page
      .locator(`a[href="/c/${companyId}/p/${projectId}"]`)
      .first()
      .click();
    await waitForLocation(
      page,
      ({ pathname }) => pathname === `/c/${companyId}/p/${projectId}`,
      'Project workspace did not open'
    );

    await page.getByRole('tab', { name: 'Transactions' }).click();
    await waitForLocation(
      page,
      ({ pathname, search }) =>
        pathname === `/c/${companyId}/p/${projectId}` &&
        new URLSearchParams(search).get('tab') === 'transactions',
      'Project workspace did not switch to the transactions tab'
    );

    const transactionView = page.getByRole('combobox', { name: 'Show' });
    await transactionView.waitFor({ state: 'visible' });
    assert(
      (await transactionView.inputValue()) === 'All transactions',
      'Transaction workflow filter did not default to all transactions'
    );
    await page.getByText(/^0 transactions$/).waitFor({ state: 'visible' });

    await transactionView.click();
    await page.getByRole('option', { name: 'Needs review' }).click();
    await waitForLocation(
      page,
      ({ pathname, search }) =>
        pathname === `/c/${companyId}/p/${projectId}` &&
        new URLSearchParams(search).get('tab') === 'transactions' &&
        new URLSearchParams(search).get('view') === 'needs-review',
      'Transaction workflow filter did not update the workspace URL'
    );

    await page.getByRole('button', { name: 'Tools' }).click();
    await page
      .getByRole('menuitem', { name: 'Find reversal matches' })
      .waitFor({ state: 'visible' });
    await page
      .getByRole('menuitem', { name: 'Manage categories' })
      .waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Budget' }).click();
    await waitForLocation(
      page,
      ({ pathname, search }) =>
        pathname === `/c/${companyId}/p/${projectId}` &&
        !new URLSearchParams(search).get('tab'),
      'Project workspace did not switch back to the budget tab'
    );

    assert(
      pageErrors.length === 0,
      `Browser page errors detected: ${pageErrors.join(' | ')}`
    );
    assert(
      consoleErrors.length === 0,
      `Browser console errors detected: ${consoleErrors.join(' | ')}`
    );

    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const requestedSections = parseRequestedSections(argv);
  const useGeneratedFixtures = hasFlag(argv, '--use-generated-fixtures');
  const sweepStaleFixtures = hasFlag(argv, '--sweep-stale-fixtures');
  const cleanupOnly = hasFlag(argv, '--cleanup-stale-fixtures');
  const baseUrl = getSmokeConfiguredBaseUrl();
  let fixtures: SmokeFixtures | null = null;

  if (requestedSections.size > 0) {
    const unsupportedSections = Array.from(requestedSections).filter(
      (section) => section !== 'basics'
    );
    if (unsupportedSections.length > 0) {
      throw new Error(
        `Browser smoke currently supports only the basics flow. Unsupported section(s): ${unsupportedSections.join(', ')}`
      );
    }
  }

  try {
    if (cleanupOnly) {
      await sweepSmokeFixtures({
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
      return;
    }

    if (useGeneratedFixtures) {
      fixtures = await createSmokeFixtures({
        sweepStale: sweepStaleFixtures,
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    } else if (sweepStaleFixtures) {
      await sweepSmokeFixtures({
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    }

    await runBrowserSmoke(baseUrl, {
      onStatus(message) {
        console.info(`[..] ${message}`);
      },
    });
    console.info('[ok] Browser smoke flow passed');
  } finally {
    if (fixtures) {
      await cleanupSmokeFixtures(fixtures, {
        onStatus(message) {
          console.info(`[..] ${message}`);
        },
      });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
