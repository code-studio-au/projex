import type { APIResponse, Locator, Page } from '@playwright/test';

import { getSmokeConfiguredBaseUrl } from '../../../src/server/smoke/env';
import type { SmokeFixtures } from '../../../src/server/smoke/fixtures';

export type SmokePageOptions = {
  onStatus?: (message: string) => void | Promise<void>;
};

const webKitCancellationSuffix = ' due to access control checks.';
const transactionCommentSummariesUrl =
  /^(?:(?:https?:\/\/[^/\s]+)|(?:\/?localhost(?::\d+)?))?\/api\/projects\/[^/?#]+\/transactions\/comment-summaries(?:\?[^#\s]*)?$/;

export function isExpectedWebKitNavigationCancellation(
  browserName: string,
  message: string
) {
  if (browserName !== 'webkit' || !message.endsWith(webKitCancellationSuffix)) {
    return false;
  }

  const requestUrl = message.slice(0, -webKitCancellationSuffix.length);
  return (
    requestUrl.includes('/_serverFn/') ||
    transactionCommentSummariesUrl.test(requestUrl)
  );
}

export abstract class AuthenticatedSmokePage {
  protected readonly baseUrl = getSmokeConfiguredBaseUrl();
  protected readonly page: Page;
  protected readonly fixtures: SmokeFixtures;
  private readonly consoleErrors: string[] = [];
  private readonly onStatus: SmokePageOptions['onStatus'];
  private readonly pageErrors: string[] = [];

  constructor(
    page: Page,
    fixtures: SmokeFixtures,
    options: SmokePageOptions = {}
  ) {
    this.page = page;
    this.fixtures = fixtures;
    this.onStatus = options.onStatus;

    page.on('pageerror', (error) => {
      const browserName =
        page.context().browser()?.browserType().name() ?? 'unknown';
      // WebKit reports specific same-origin fetches cancelled by a navigation
      // or query replacement as page errors with this exact wording. Keep the
      // exception limited to known endpoints; all other page errors stay fatal.
      if (isExpectedWebKitNavigationCancellation(browserName, error.message)) {
        return;
      }
      this.pageErrors.push(`${page.url()}: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (!text.includes('favicon')) this.consoleErrors.push(text);
    });
  }

  protected assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  protected async assertApiResponseOk(response: APIResponse, message: string) {
    if (response.ok()) return;

    const responseBody = (await response.text()).trim();
    throw new Error(
      `${message}: ${response.status()}${responseBody ? ` ${responseBody}` : ''}`
    );
  }

  protected assertNoBrowserErrors() {
    this.assert(
      this.pageErrors.length === 0,
      `Browser page errors detected: ${this.pageErrors.join(' | ')}`
    );
    this.assert(
      this.consoleErrors.length === 0,
      `Browser console errors detected: ${this.consoleErrors.join(' | ')}`
    );
  }

  protected async clickActionMenuItem(
    actionButton: Locator,
    itemName: string | RegExp
  ) {
    await actionButton.waitFor({ state: 'visible' });
    await this.waitForStableLocator(actionButton);
    await actionButton.click();
    const menuId = await actionButton.getAttribute('aria-controls');
    this.assert(menuId, 'Action menu trigger did not identify its dropdown');

    const menu = this.page.locator(`#${menuId}`);
    await menu.waitFor({ state: 'visible' });
    const menuItem = menu.getByRole('menuitem', { name: itemName });
    await menuItem.waitFor({ state: 'visible' });
    await this.waitForStableLocator(menuItem);
    await menuItem.click();
  }

  protected async emit(message: string) {
    await this.onStatus?.(message);
  }

  protected escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  protected async gotoCompany(search = '') {
    const suffix = search ? `?${search}` : '';
    const response = await this.page.goto(
      `/c/${this.fixtures.companyId}${suffix}`,
      { waitUntil: 'domcontentloaded' }
    );
    this.assert(response, 'Company page navigation did not return a response');
    this.assert(response.ok(), 'Company page did not load successfully');
    await this.waitForAuthenticatedHydration();
    return response;
  }

  protected async gotoProject(search = '') {
    const suffix = search ? `?${search}` : '';
    const response = await this.page.goto(
      `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}${suffix}`,
      { waitUntil: 'domcontentloaded' }
    );
    this.assert(response, 'Project navigation did not return a response');
    this.assert(response.ok(), 'Project workspace did not load successfully');
    await this.waitForAuthenticatedHydration();
    return response;
  }

  protected async openTaxonomyCategory(categoryName: string) {
    await this.page
      .getByRole('button', {
        name: new RegExp(`^${this.escapeRegExp(categoryName)}\\b`),
      })
      .click();
  }

  protected async selectOption(dialog: Locator, label: string, option: string) {
    await dialog.getByRole('combobox', { name: label }).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  protected async signIn() {
    await this.emit('Signing in through the browser session');
    const user = this.fixtures.users.privacyAdmin;
    const response = await this.page
      .context()
      .request.post(`${this.baseUrl}/api/auth/sign-in/email`, {
        data: { email: user.email, password: user.password },
        headers: {
          origin: this.baseUrl,
          referer: `${this.baseUrl}/login`,
        },
      });
    this.assert(response.ok(), 'Browser-context sign-in request failed');
  }

  protected async waitForLocation(
    predicate: (location: { pathname: string; search: string }) => boolean,
    message: string
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15_000) {
      const current = await this.page.evaluate<{
        pathname: string;
        search: string;
      }>(() => ({
        pathname: globalThis.location.pathname,
        search: globalThis.location.search,
      }));
      if (predicate(current)) return;
      await this.page.waitForTimeout(250);
    }
    throw new Error(`${message}. Current URL: ${this.page.url()}`);
  }

  protected async waitForAuthenticatedHydration() {
    const accountButton = this.page.getByRole('button', { name: 'Account' });
    await accountButton.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).some(
          (button) =>
            button.getAttribute('aria-label') === 'Account' && !button.disabled
        ),
      undefined,
      { timeout: 15_000 }
    );
  }

  protected async waitForStableLocator(locator: Locator) {
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
      await this.page.waitForTimeout(75);
    }

    throw new Error('Timed out waiting for an animated control to settle');
  }

  protected async waitForTabSelection(name: string, message: string) {
    const tab = this.page.getByRole('tab', { name });
    const startedAt = Date.now();

    while (Date.now() - startedAt < 15_000) {
      if ((await tab.getAttribute('aria-selected')) === 'true') return;
      await this.page.waitForTimeout(250);
    }

    throw new Error(`${message}. Current URL: ${this.page.url()}`);
  }
}
