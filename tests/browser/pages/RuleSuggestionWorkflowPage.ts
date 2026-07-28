import type { Page } from '@playwright/test';

import type { SmokeFixtures } from '../../../src/server/smoke/fixtures';
import {
  AuthenticatedSmokePage,
  type SmokePageOptions,
} from './AuthenticatedSmokePage';

export class RuleSuggestionWorkflowPage extends AuthenticatedSmokePage {
  constructor(
    page: Page,
    fixtures: SmokeFixtures,
    options: SmokePageOptions = {}
  ) {
    super(page, fixtures, options);
  }

  async verify() {
    await this.signIn();
    await this.gotoCompany('tab=settings');
    await this.acceptRefinedSuggestion();
    await this.verifyAcceptedRuleTarget();
    this.assertNoBrowserErrors();
  }

  private async acceptRefinedSuggestion() {
    const suggestion = this.fixtures.browserRuleSuggestion;
    await this.emit('Reviewing and accepting a refined rule suggestion');
    await this.page
      .getByRole('button', { name: 'Review Rule Suggestions' })
      .click();

    const dialog = this.page.getByRole('dialog', {
      name: 'Rule Suggestions',
    });
    await dialog.waitFor({ state: 'visible' });
    await dialog
      .getByText('Existing rule correction', { exact: true })
      .waitFor({ state: 'visible' });
    await dialog
      .getByText('high confidence (80%)', { exact: true })
      .waitFor({ state: 'visible' });
    await dialog
      .getByText('Rule being corrected', { exact: true })
      .waitFor({ state: 'visible' });
    await dialog
      .getByText(`Contains "${suggestion.sourceRuleMatchText}"`, {
        exact: true,
      })
      .waitFor({ state: 'visible' });

    const actionSelect = dialog.getByRole('combobox', {
      name: 'How should this correction be applied?',
    });
    this.assert(
      (await actionSelect.inputValue()) ===
        'Create a narrower, higher-priority rule',
      'Rule suggestion did not default to the safer narrower-rule action'
    );
    await dialog
      .getByRole('textbox', {
        name: 'Text the transaction must contain',
      })
      .fill(suggestion.acceptedMatchText);
    await dialog
      .getByRole('button', { name: 'Create narrower rule', exact: true })
      .click();
    await dialog
      .getByText(
        'Create narrower rule accepted and synced to eligible projects.',
        { exact: true }
      )
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }

  private async verifyAcceptedRuleTarget() {
    const suggestion = this.fixtures.browserRuleSuggestion;
    await this.page
      .getByRole('button', { name: 'Manage Auto-Coding Rules' })
      .click();
    await this.page
      .getByText('Company rule priority', { exact: true })
      .waitFor({ state: 'visible' });
    const ruleTitle = this.page.getByText(suggestion.acceptedMatchText, {
      exact: true,
    });
    await ruleTitle.waitFor({ state: 'visible' });
    const ruleCardText = await ruleTitle.locator('..').textContent();
    this.assert(
      ruleCardText?.includes(suggestion.companyDefaultCategoryName) &&
        ruleCardText.includes(suggestion.targetCompanyDefaultSubCategoryName),
      'Accepted rule suggestion did not display its corrected company target'
    );
  }
}
