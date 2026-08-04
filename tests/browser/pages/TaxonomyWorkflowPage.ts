import { expect, type Page } from '@playwright/test';

import type { SmokeFixtures } from '../../../src/server/smoke/fixtures';
import {
  AuthenticatedSmokePage,
  type SmokePageOptions,
} from './AuthenticatedSmokePage';

export class TaxonomyWorkflowPage extends AuthenticatedSmokePage {
  constructor(
    page: Page,
    fixtures: SmokeFixtures,
    options: SmokePageOptions = {}
  ) {
    super(page, fixtures, options);
  }

  async verify() {
    await this.signIn();
    await this.gotoProject('tab=transactions');
    await this.openProjectTaxonomy();
    await this.verifyModalSelectScrolling();
    await this.moveAndDeleteSubcategory();
    await this.verifyReassignedRuleTarget();
    this.assertNoBrowserErrors();
  }

  private async verifyModalSelectScrolling() {
    await this.emit('Verifying contained modal Select scrolling');
    const dialog = this.page.getByRole('dialog', {
      name: 'Manage categories & subcategories',
    });
    const modalBody = dialog.locator('.mantine-Modal-body');
    const pageScrollTop = await this.page.evaluate(() => window.scrollY);

    this.assert(
      await this.page.evaluate(() =>
        document.body.hasAttribute('data-scroll-locked')
      ),
      'Opening the taxonomy modal did not lock background page scrolling'
    );

    const categorySelect = dialog.getByRole('combobox', {
      name: 'Category',
    });
    await categorySelect.click();
    const dropdownId = await categorySelect.getAttribute('aria-controls');
    this.assert(
      dropdownId,
      'Taxonomy category Select did not expose a dropdown'
    );
    const listbox = dialog.locator(`[id="${dropdownId}"]`);
    const dropdown = listbox.locator('..');
    await dropdown.waitFor({ state: 'visible' });

    const dropdownScroll = await dropdown.evaluate<
      { clientHeight: number; scrollHeight: number; scrollTop: number },
      HTMLElement
    >((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    this.assert(
      dropdownScroll.scrollHeight > dropdownScroll.clientHeight,
      'Taxonomy category Select did not create a scrollable dropdown'
    );
    const browserName = this.page.context().browser()?.browserType().name();
    if (browserName === 'webkit') {
      // Playwright WebKit does not reliably deliver wheel events to a nested
      // overflow element under document scroll lock. Exercise the real WebKit
      // scroll container through Playwright's element-scrolling primitive.
      await listbox.getByRole('option').last().scrollIntoViewIfNeeded();
    } else {
      await expect
        .poll(
          async () => {
            await dropdown.hover();
            await this.page.mouse.wheel(0, 300);
            return dropdown.evaluate<number, HTMLElement>(
              (element) => element.scrollTop
            );
          },
          {
            message:
              'Taxonomy category Select should respond to wheel scrolling',
            timeout: 2_000,
          }
        )
        .toBeGreaterThan(dropdownScroll.scrollTop);
    }
    const dropdownScrollTop = await dropdown.evaluate<number, HTMLElement>(
      (element) => element.scrollTop
    );
    this.assert(
      dropdownScrollTop > dropdownScroll.scrollTop,
      'Taxonomy category Select did not scroll within its contained dropdown'
    );
    this.assert(
      (await this.page.evaluate(() => window.scrollY)) === pageScrollTop,
      'Scrolling the contained Select moved the background page'
    );

    await this.page.keyboard.press('Escape');
    await dropdown.waitFor({ state: 'hidden' });

    const modalScroll = await modalBody.evaluate<
      { clientHeight: number; scrollHeight: number; scrollTop: number },
      HTMLElement
    >((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    this.assert(
      modalScroll.scrollHeight > modalScroll.clientHeight,
      'Taxonomy modal did not create an internal scroll region'
    );
    await expect
      .poll(
        async () => {
          await modalBody.hover();
          await this.page.mouse.wheel(0, 500);
          return modalBody.evaluate<number, HTMLElement>(
            (element) => element.scrollTop
          );
        },
        {
          message:
            'Taxonomy modal should keep responding to wheel scrolling after Select use',
          timeout: 2_000,
        }
      )
      .toBeGreaterThan(modalScroll.scrollTop);
    this.assert(
      (await this.page.evaluate(() => window.scrollY)) === pageScrollTop,
      'Scrolling the taxonomy modal moved the background page'
    );
    await modalBody.evaluate((element) => {
      element.scrollTop = 0;
    });
  }

  private async moveAndDeleteSubcategory() {
    const taxonomy = this.fixtures.browserTaxonomy;

    await this.emit('Moving a subcategory with a dependent auto-coding rule');
    await this.openTaxonomyCategory(taxonomy.sourceCategoryName);
    const sourceActions = this.page.getByRole('button', {
      name: `Actions for subcategory ${taxonomy.sourceSubCategoryName}`,
    });
    await this.clickActionMenuItem(sourceActions, /Move to another category/);

    const moveDialog = this.page.getByRole('dialog', {
      name: 'Move subcategory',
    });
    await moveDialog.waitFor({ state: 'visible' });
    await moveDialog
      .getByText(
        /1 rule targeting this exact subcategory ID will follow the move/
      )
      .waitFor({ state: 'visible' });
    await this.selectOption(
      moveDialog,
      'New category',
      taxonomy.destinationCategoryName
    );
    await moveDialog
      .getByRole('button', { name: 'Move subcategory', exact: true })
      .click();
    await moveDialog.waitFor({ state: 'hidden' });
    await this.page
      .getByText(`Moved subcategory "${taxonomy.sourceSubCategoryName}".`, {
        exact: true,
      })
      .waitFor({ state: 'visible' });

    await this.emit(
      'Deleting the moved subcategory and reassigning its dependent rule'
    );
    await this.openTaxonomyCategory(taxonomy.destinationCategoryName);
    const movedSourceActions = this.page.getByRole('button', {
      name: `Actions for subcategory ${taxonomy.sourceSubCategoryName}`,
    });
    await movedSourceActions.waitFor({ state: 'visible' });
    await this.clickActionMenuItem(movedSourceActions, 'Delete subcategory');

    const deleteDialog = this.page.getByRole('dialog', {
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
    this.assert(
      (await handling.inputValue()).startsWith('Reassign 1 rule'),
      'Dependent rule reassignment was not the default delete behavior'
    );
    await this.selectOption(
      deleteDialog,
      'Replacement category',
      taxonomy.destinationCategoryName
    );
    await this.selectOption(
      deleteDialog,
      'Replacement subcategory',
      taxonomy.replacementSubCategoryName
    );
    await deleteDialog.getByRole('button', { name: 'Delete' }).click();
    await deleteDialog.waitFor({ state: 'hidden' });
    await movedSourceActions.waitFor({ state: 'detached' });
    await this.page.keyboard.press('Escape');
  }

  private async openProjectTaxonomy() {
    await this.page.getByRole('button', { name: 'Tools' }).click();
    await this.page
      .getByRole('menuitem', { name: 'Manage categories' })
      .click();
    await this.page
      .getByText('Company standards', { exact: true })
      .waitFor({ state: 'visible' });
  }

  private async verifyReassignedRuleTarget() {
    const taxonomy = this.fixtures.browserTaxonomy;
    await this.gotoProject('tab=settings');
    await this.page
      .getByRole('button', { name: 'Manage Auto-Coding Rules' })
      .click();
    const ruleTitle = this.page.getByText(taxonomy.ruleMatchText, {
      exact: true,
    });
    await ruleTitle.waitFor({ state: 'visible' });
    const ruleCardText = await ruleTitle.locator('..').textContent();
    this.assert(
      ruleCardText?.includes(taxonomy.destinationCategoryName) &&
        ruleCardText.includes(taxonomy.replacementSubCategoryName),
      'Reassigned auto-coding rule did not display its final category and subcategory target'
    );
  }
}
