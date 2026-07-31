import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { SmokeFixtures } from '../../../src/server/smoke/fixtures';
import { AuthenticatedSmokePage } from './AuthenticatedSmokePage';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export class AccessibilityPage extends AuthenticatedSmokePage {
  constructor(page: Page, fixtures: SmokeFixtures) {
    super(page, fixtures);
  }

  async verify() {
    await this.verifyLoginPage();
    await this.signIn();
    await this.gotoCompany('tab=projects');
    await this.page
      .getByRole('tab', { name: 'Projects & programmes' })
      .waitFor({ state: 'visible' });
    await this.page
      .locator(
        `a[href="/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}"]`
      )
      .first()
      .waitFor({ state: 'visible' });
    await this.assertNoViolations('Authenticated application shell');
    this.assertNoBrowserErrors();
  }

  private async assertNoViolations(label: string) {
    const results = await new AxeBuilder({ page: this.page })
      .withTags(wcagTags)
      .analyze();
    this.assert(
      results.violations.length === 0,
      `${label} accessibility violations:\n${JSON.stringify(results.violations, null, 2)}`
    );
  }

  private async verifyLoginPage() {
    const response = await this.page.goto('/login', {
      waitUntil: 'domcontentloaded',
    });
    this.assert(response?.ok(), 'Login page did not load successfully');
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
      'Login page did not hydrate before accessibility analysis'
    );
    await this.assertNoViolations('Login page');
  }
}
