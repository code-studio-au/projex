import type { Locator, Page } from '@playwright/test';

import { APP_COLOR_SCHEME_STORAGE_KEY } from '../../../src/colorScheme';
import type { SmokeFixtures } from '../../../src/server/smoke/fixtures';
import {
  AuthenticatedSmokePage,
  type SmokePageOptions,
} from './AuthenticatedSmokePage';

export class ApplicationShellPage extends AuthenticatedSmokePage {
  constructor(
    page: Page,
    fixtures: SmokeFixtures,
    options: SmokePageOptions = {}
  ) {
    super(page, fixtures, options);
  }

  async verify() {
    await this.verifyLoginHydrationAndColorScheme();
    await this.signIn();
    await this.verifySingleCompanyServerRedirect();
    await this.verifyCompanyAndProjectNavigation();
    await this.verifyProjectToolsAndTabs();
    await this.verifyCompanySettings();
    this.assertNoBrowserErrors();
  }

  private verifyCsp(html: string, csp: string | undefined) {
    this.assert(csp, 'Missing Content-Security-Policy header on login page');
    this.assert(
      csp.includes("script-src 'nonce-"),
      'Login page CSP is missing a nonce-based script-src directive'
    );

    const metaNonce = /<meta property="csp-nonce" content="([^"]+)"/i.exec(
      html
    )?.[1];
    this.assert(metaNonce, 'Login page is missing the csp-nonce meta tag');
    this.assert(
      csp.includes(`nonce-${metaNonce}`),
      'Login page CSP nonce does not match the HTML nonce'
    );
  }

  private verifyServerRenderedDisabledButton(html: string, label: string) {
    const buttonTag = new RegExp(
      `<button\\b[^>]*aria-label="${this.escapeRegExp(label)}"[^>]*>`,
      'i'
    ).exec(html)?.[0];
    this.assert(buttonTag, `Page did not server-render the ${label} button`);
    this.assert(
      /\sdisabled(?:=""|(?=[\s>]))/i.test(buttonTag),
      `Server-rendered ${label} button was interactive before hydration`
    );
  }

  private async toggleColorScheme(
    toggle: Locator,
    colorScheme: 'light' | 'dark'
  ) {
    await toggle.click();
    await this.waitForColorScheme(colorScheme);
  }

  private async verifyCompanyAndProjectNavigation() {
    const companyResponse = await this.gotoCompany('tab=projects');
    const companyHtml = await companyResponse.text();
    this.verifyServerRenderedDisabledButton(companyHtml, 'Workspace');
    this.verifyServerRenderedDisabledButton(companyHtml, 'Account');
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname === `/c/${this.fixtures.companyId}` &&
        new URLSearchParams(search).get('tab') === 'projects',
      'Company dashboard did not open on the projects tab'
    );
    await this.waitForTabSelection(
      'Projects & programmes',
      'Company dashboard did not select the projects tab'
    );
    await this.waitForColorScheme('dark');

    const accountMenuButton = this.page.getByRole('button', {
      name: 'Account',
    });
    await accountMenuButton.click();
    const colorSchemeMenuItem = this.page.getByRole('menuitem', {
      name: 'Toggle light or dark mode',
    });
    await colorSchemeMenuItem.waitFor({ state: 'visible' });
    this.assert(
      await colorSchemeMenuItem.isEnabled(),
      'Hydrated color scheme menu item was not interactive'
    );
    await colorSchemeMenuItem.click();
    await this.waitForColorScheme('light');
    await accountMenuButton.click();
    await this.page
      .getByRole('menuitem', { name: 'Toggle light or dark mode' })
      .click();
    await this.waitForColorScheme('dark');

    await this.emit('Opening the generated project workspace');
    await this.page
      .locator(
        `a[href="/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}"]`
      )
      .first()
      .click();
    await this.waitForLocation(
      ({ pathname }) =>
        pathname ===
        `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}`,
      'Project workspace did not open'
    );
  }

  private async verifySingleCompanyServerRedirect() {
    await this.emit('Verifying the single-company server redirect');
    const response = await this.page.goto('/companies', {
      waitUntil: 'domcontentloaded',
    });
    this.assert(response, 'Companies route did not return a response');
    this.assert(response.ok(), 'Companies route redirect did not load');
    this.assert(
      new URL(response.url()).pathname === `/c/${this.fixtures.companyId}`,
      'Single-company user was not redirected before company rendering'
    );

    const html = await response.text();
    this.assert(
      !/<h2\b[^>]*>\s*Companies\s*<\/h2>/i.test(html),
      'Single-company redirect painted the companies landing page'
    );
    this.assert(
      html.includes('Projects &amp; programmes'),
      'Redirect response did not server-render the company dashboard'
    );
    await this.waitForAuthenticatedHydration();
  }

  private async verifyCompanySettings() {
    await this.gotoCompany('tab=settings');
    await this.page.getByRole('tab', { name: 'Settings' }).waitFor({
      state: 'visible',
    });
    await this.page.getByRole('button', { name: 'Manage Categories' }).click();
    await this.page
      .getByText('Company category standards', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
    await this.page
      .getByRole('button', { name: 'Manage Import Rules' })
      .click();
    await this.page
      .getByText('Import rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
    await this.page
      .getByRole('button', { name: 'Manage Auto-Coding Rules' })
      .click();
    await this.page
      .getByText('Company rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
  }

  private async verifyLoginHydrationAndColorScheme() {
    await this.emit('Opening login page');
    const loginResponse = await this.page.goto('/login', {
      waitUntil: 'domcontentloaded',
    });
    this.assert(
      loginResponse,
      'Login page navigation did not return a response'
    );
    this.assert(loginResponse.ok(), 'Login page did not load successfully');
    const loginHtml = await loginResponse.text();
    this.verifyCsp(
      loginHtml,
      loginResponse.headers()['content-security-policy']
    );
    this.verifyServerRenderedDisabledButton(
      loginHtml,
      'Toggle light or dark mode'
    );

    const colorSchemeToggle = this.page.getByRole('button', {
      name: 'Toggle light or dark mode',
    });
    await colorSchemeToggle.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).some(
          (button) =>
            button.getAttribute('aria-label') === 'Toggle light or dark mode' &&
            !button.disabled
        ),
      undefined,
      { timeout: 15_000 }
    );
    this.assert(
      await colorSchemeToggle.isEnabled(),
      'Color scheme toggle did not become interactive after hydration'
    );
    await this.toggleColorScheme(colorSchemeToggle, 'dark');
    this.assert(
      (await this.page.evaluate(
        (storageKey) => globalThis.localStorage.getItem(storageKey),
        APP_COLOR_SCHEME_STORAGE_KEY
      )) === 'dark',
      'Dark mode preference was not persisted'
    );
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForColorScheme('dark');
    await colorSchemeToggle.waitFor({ state: 'visible' });
    await this.toggleColorScheme(colorSchemeToggle, 'light');
    await this.toggleColorScheme(colorSchemeToggle, 'dark');
  }

  private async verifyProjectToolsAndTabs() {
    await this.page.getByRole('tab', { name: 'Transactions' }).click();
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        new URLSearchParams(search).get('tab') === 'transactions',
      'Project workspace did not switch to the transactions tab'
    );

    const transactionView = this.page.getByRole('combobox', {
      name: 'Workflow view',
    });
    await transactionView.waitFor({ state: 'visible' });
    this.assert(
      (await transactionView.inputValue()) === 'All transactions',
      'Transaction workflow filter did not default to all transactions'
    );
    await this.page.getByText(/^0 transactions$/).waitFor({ state: 'visible' });

    await transactionView.click();
    await this.page.getByRole('option', { name: 'Needs review' }).click();
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        new URLSearchParams(search).get('tab') === 'transactions' &&
        new URLSearchParams(search).get('view') === 'needs-review',
      'Transaction workflow filter did not update the workspace URL'
    );

    await this.page.getByRole('button', { name: 'Tools' }).click();
    await this.page
      .getByRole('menuitem', { name: 'Find reversal matches' })
      .waitFor({ state: 'visible' });
    await this.page
      .getByRole('menuitem', { name: 'Manage categories' })
      .click();
    await this.page
      .getByText('Company standards', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');

    await this.page.getByRole('tab', { name: 'Settings' }).click();
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        new URLSearchParams(search).get('tab') === 'settings',
      'Project workspace did not switch to the settings tab'
    );
    await this.page
      .getByRole('button', { name: 'Manage Auto-Coding Rules' })
      .click();
    await this.page
      .getByText('Project rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
    await this.page
      .getByRole('button', { name: 'Manage Import Rules' })
      .click();
    await this.page
      .getByText('Import rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');

    await this.page.getByRole('tab', { name: 'Budget' }).click();
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        !new URLSearchParams(search).get('tab'),
      'Project workspace did not switch back to the budget tab'
    );
  }

  private async waitForColorScheme(colorScheme: 'light' | 'dark') {
    await this.page.waitForFunction(
      (expectedColorScheme) =>
        document.documentElement.dataset.mantineColorScheme ===
        expectedColorScheme,
      colorScheme,
      { timeout: 15_000 }
    );
  }
}
