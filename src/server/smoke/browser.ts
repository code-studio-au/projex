import { chromium } from 'playwright';

import {
  cleanupSmokeFixtures,
  createSmokeFixtures,
  sweepSmokeFixtures,
  type SmokeFixtures,
} from './fixtures.ts';
import { getSmokeConfiguredBaseUrl } from './env.ts';
import { APP_COLOR_SCHEME_STORAGE_KEY } from '../../colorScheme.ts';

type BrowserSmokeOptions = {
  generatedFixtures?: SmokeFixtures;
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

async function waitForColorScheme(
  page: import('playwright').Page,
  colorScheme: 'light' | 'dark'
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (
      (await page.locator('html').getAttribute('data-mantine-color-scheme')) ===
      colorScheme
    ) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`App did not switch to ${colorScheme} mode`);
}

async function selectOption(
  page: import('playwright').Page,
  dialog: import('playwright').Locator,
  label: string,
  option: string
) {
  await dialog.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openTaxonomyCategory(
  page: import('playwright').Page,
  categoryName: string
) {
  await page
    .getByRole('button', {
      name: new RegExp(`^${escapeRegExp(categoryName)}\\b`),
    })
    .click();
}

async function waitForStableLocator(
  page: import('playwright').Page,
  locator: import('playwright').Locator
) {
  const startedAt = Date.now();
  let previousBox: Awaited<ReturnType<typeof locator.boundingBox>> = null;
  let stableSamples = 0;

  while (Date.now() - startedAt < 5_000) {
    const box = await locator.boundingBox();
    const isStable =
      box !== null &&
      previousBox !== null &&
      Math.abs(box.x - previousBox.x) < 0.5 &&
      Math.abs(box.y - previousBox.y) < 0.5 &&
      Math.abs(box.width - previousBox.width) < 0.5 &&
      Math.abs(box.height - previousBox.height) < 0.5;

    stableSamples = isStable ? stableSamples + 1 : 0;
    if (stableSamples >= 3) return;

    previousBox = box;
    await page.waitForTimeout(75);
  }

  throw new Error('Timed out waiting for an animated control to settle');
}

async function clickActionMenuItem(
  page: import('playwright').Page,
  actionButton: import('playwright').Locator,
  itemName: string | RegExp
) {
  await actionButton.waitFor({ state: 'visible' });
  await waitForStableLocator(page, actionButton);
  await actionButton.click();
  const menuId = await actionButton.getAttribute('aria-controls');
  assert(menuId, 'Action menu trigger did not identify its dropdown');

  const menu = page.locator(`#${menuId}`);
  await menu.waitFor({ state: 'visible' });
  const menuItem = menu.getByRole('menuitem', { name: itemName });
  await menuItem.waitFor({ state: 'visible' });
  await waitForStableLocator(page, menuItem);
  await menuItem.click();
}

async function runGeneratedTaxonomyRuleFlow(
  page: import('playwright').Page,
  fixtures: SmokeFixtures,
  options: BrowserSmokeOptions
) {
  const taxonomy = fixtures.browserTaxonomy;

  await emit(options, 'Moving a subcategory with a dependent auto-coding rule');
  await openTaxonomyCategory(page, taxonomy.sourceCategoryName);
  const sourceActions = page.getByRole('button', {
    name: `Actions for subcategory ${taxonomy.sourceSubCategoryName}`,
  });
  await clickActionMenuItem(page, sourceActions, /Move to another category/);

  const moveDialog = page.getByRole('dialog', { name: 'Move subcategory' });
  await moveDialog.waitFor({ state: 'visible' });
  await moveDialog
    .getByText(
      /1 rule targeting this exact subcategory ID will follow the move/
    )
    .waitFor({ state: 'visible' });
  await selectOption(
    page,
    moveDialog,
    'New category',
    taxonomy.destinationCategoryName
  );
  await moveDialog
    .getByRole('button', { name: 'Move subcategory', exact: true })
    .click();
  await moveDialog.waitFor({ state: 'hidden' });
  await page
    .getByText(`Moved subcategory "${taxonomy.sourceSubCategoryName}".`, {
      exact: true,
    })
    .waitFor({ state: 'visible' });

  await emit(
    options,
    'Deleting the moved subcategory and reassigning its dependent rule'
  );
  await openTaxonomyCategory(page, taxonomy.destinationCategoryName);
  const movedSourceActions = page.getByRole('button', {
    name: `Actions for subcategory ${taxonomy.sourceSubCategoryName}`,
  });
  await movedSourceActions.waitFor({ state: 'visible' });
  await clickActionMenuItem(page, movedSourceActions, 'Delete subcategory');

  const deleteDialog = page.getByRole('dialog', {
    name: 'Delete subcategory?',
  });
  await deleteDialog.waitFor({ state: 'visible' });
  await deleteDialog
    .getByText(
      new RegExp(`1 rule targets this subcategory.*${taxonomy.ruleMatchText}`)
    )
    .waitFor({ state: 'visible' });
  const handling = deleteDialog.getByRole('combobox', {
    name: 'Affected rule handling',
  });
  assert(
    (await handling.inputValue()).startsWith('Reassign 1 rule'),
    'Dependent rule reassignment was not the default delete behavior'
  );
  await selectOption(
    page,
    deleteDialog,
    'Replacement category',
    taxonomy.destinationCategoryName
  );
  await selectOption(
    page,
    deleteDialog,
    'Replacement subcategory',
    taxonomy.replacementSubCategoryName
  );
  await deleteDialog.getByRole('button', { name: 'Delete' }).click();
  await deleteDialog.waitFor({ state: 'hidden' });
  await movedSourceActions.waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
}

async function verifyGeneratedRuleTarget(
  page: import('playwright').Page,
  fixtures: SmokeFixtures
) {
  const taxonomy = fixtures.browserTaxonomy;
  const ruleTitle = page.getByText(taxonomy.ruleMatchText, { exact: true });
  await ruleTitle.waitFor({ state: 'visible' });
  const ruleCardText = await ruleTitle.locator('..').textContent();
  assert(
    ruleCardText?.includes(taxonomy.destinationCategoryName) &&
      ruleCardText.includes(taxonomy.replacementSubCategoryName),
    'Reassigned auto-coding rule did not display its final category and subcategory target'
  );
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
      colorScheme: 'light',
      extraHTTPHeaders: { 'x-real-ip': '127.0.0.1' },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.on('pageerror', (error) => {
      pageErrors.push(`${page.url()}: ${error.message}`);
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

    const colorSchemeToggle = page.getByRole('button', {
      name: 'Toggle light or dark mode',
    });
    await colorSchemeToggle.click();
    await waitForColorScheme(page, 'dark');
    assert(
      (await page.evaluate(
        (storageKey) => globalThis.localStorage.getItem(storageKey),
        APP_COLOR_SCHEME_STORAGE_KEY
      )) === 'dark',
      'Dark mode preference was not persisted'
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForColorScheme(page, 'dark');
    await colorSchemeToggle.waitFor({ state: 'visible' });
    await colorSchemeToggle.click();
    await waitForColorScheme(page, 'light');
    await colorSchemeToggle.click();
    await waitForColorScheme(page, 'dark');

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
    await waitForColorScheme(page, 'dark');

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

    const transactionView = page.getByRole('combobox', {
      name: 'Workflow view',
    });
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
    const manageCategoriesItem = page.getByRole('menuitem', {
      name: 'Manage categories',
    });
    await manageCategoriesItem.waitFor({ state: 'visible' });
    await manageCategoriesItem.click();
    await page
      .getByText('Company standards', { exact: true })
      .waitFor({ state: 'visible' });
    if (options.generatedFixtures) {
      await runGeneratedTaxonomyRuleFlow(
        page,
        options.generatedFixtures,
        options
      );
    } else {
      await page.keyboard.press('Escape');
    }

    await page.getByRole('tab', { name: 'Settings' }).click();
    await waitForLocation(
      page,
      ({ pathname, search }) =>
        pathname === `/c/${companyId}/p/${projectId}` &&
        new URLSearchParams(search).get('tab') === 'settings',
      'Project workspace did not switch to the settings tab'
    );
    await page
      .getByRole('button', { name: 'Manage Auto-Coding Rules' })
      .click();
    await page
      .getByText('Project rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    if (options.generatedFixtures) {
      await verifyGeneratedRuleTarget(page, options.generatedFixtures);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Manage Import Rules' }).click();
    await page
      .getByText('Import rule priority', { exact: true })
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

    await page.goto(`${baseUrl}/c/${companyId}?tab=settings`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('tab', { name: 'Settings' }).waitFor({
      state: 'visible',
    });
    await page.getByRole('button', { name: 'Manage Categories' }).click();
    await page
      .getByText('Company category standards', { exact: true })
      .waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Manage Import Rules' }).click();
    await page
      .getByText('Import rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Manage Auto-Coding Rules' })
      .click();
    await page
      .getByText('Company rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');

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
      generatedFixtures: fixtures ?? undefined,
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
