import type { Page } from '@playwright/test';

import type { SmokeFixtures } from '../../../src/server/smoke/fixtures';
import {
  AuthenticatedSmokePage,
  type SmokePageOptions,
} from './AuthenticatedSmokePage';

type ReversalPair = {
  amountCents: number;
  counterpartDate: string;
  counterpartItem: string;
  sourceDate: string;
  sourceItem: string;
  suffix: string;
};

export class ReversalWorkflowPage extends AuthenticatedSmokePage {
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
    await this.verifyReversalReviewQueue();
    this.assertNoBrowserErrors();
  }

  private buildReversalFixtures(pairs: ReversalPair[]) {
    return pairs.map((pair) => {
      const sourceTxnId = `txn_smoke_reversal_source_${pair.suffix}_${this.fixtures.runId}`;
      const counterpartTxnId = `txn_smoke_reversal_counterpart_${pair.suffix}_${this.fixtures.runId}`;
      const common = {
        companyId: this.fixtures.companyId,
        projectId: this.fixtures.projectId,
        description: `Browser smoke reversal pair ${pair.suffix.toUpperCase()}`,
        importSourceType: 'powerbi_expenditure_actuals',
        importSourceMeta: {
          Source: 'SMOKE_LEDGER',
          'Journal Line Description': pair.sourceItem,
          'Reference Num': `SMOKE-REV-${pair.suffix}-${this.fixtures.runId}`,
          'CC and Description': 'SMOKE-COST-CENTRE',
        },
      };
      return {
        source: {
          ...common,
          id: sourceTxnId,
          externalId: `${sourceTxnId}-external`,
          date: pair.sourceDate,
          item: pair.sourceItem,
          amountCents: pair.amountCents,
        },
        counterpart: {
          ...common,
          id: counterpartTxnId,
          externalId: `${counterpartTxnId}-external`,
          date: pair.counterpartDate,
          item: pair.counterpartItem,
          amountCents: -pair.amountCents,
        },
      };
    });
  }

  private async createTransactions(
    transactionUrl: string,
    transactions: Array<Record<string, unknown>>
  ) {
    for (const transaction of transactions) {
      const response = await this.page.context().request.post(transactionUrl, {
        data: { txn: transaction },
        headers: {
          origin: this.baseUrl,
          referer: this.page.url(),
        },
      });
      await this.assertApiResponseOk(
        response,
        'Could not create browser reversal fixture'
      );
    }
  }

  private async markPending(pairs: ReversalPair[]) {
    for (const pair of pairs) {
      await this.page
        .getByRole('button', { name: `Actions for ${pair.sourceItem}` })
        .click();
      await this.page
        .getByRole('menuitem', { name: 'Mark pending reversal' })
        .click();

      const pendingDialog = this.page.getByRole('dialog', {
        name: 'Mark pending reversal',
      });
      await pendingDialog.waitFor({ state: 'visible' });
      await pendingDialog
        .getByRole('textbox', { name: 'Comment' })
        .fill('Browser smoke expects a reversal in the following month.');
      await pendingDialog
        .getByRole('button', { name: 'Mark pending reversal' })
        .click();
      await pendingDialog.waitFor({ state: 'hidden' });

      if (pair !== pairs[0]) continue;
      await this.reopenPendingWorkflow(pair);
    }
  }

  private async reopenPendingWorkflow(pair: ReversalPair) {
    await this.emit(
      'Reopening and editing an existing pending reversal workflow'
    );
    await this.page
      .getByRole('button', { name: `Actions for ${pair.sourceItem}` })
      .click();
    await this.page
      .getByRole('menuitem', { name: 'Review reversal details' })
      .click();

    const reopenedPendingDialog = this.page.getByRole('dialog', {
      name: 'Pending reversal',
    });
    await reopenedPendingDialog.waitFor({ state: 'visible' });
    await reopenedPendingDialog
      .getByText('No candidate refund transactions were found yet.', {
        exact: true,
      })
      .waitFor({ state: 'visible' });
    await reopenedPendingDialog
      .getByRole('textbox', { name: 'Workflow note' })
      .fill('Browser smoke is escalating this reopened workflow.');
    await reopenedPendingDialog
      .getByRole('button', { name: 'Mark exception' })
      .click();
    await reopenedPendingDialog.waitFor({ state: 'hidden' });

    await this.page
      .getByRole('button', { name: `Actions for ${pair.sourceItem}` })
      .click();
    await this.page
      .getByRole('menuitem', { name: 'Review reversal details' })
      .click();
    const exceptionDialog = this.page.getByRole('dialog', {
      name: 'Reversal exception',
    });
    await exceptionDialog.waitFor({ state: 'visible' });
    await exceptionDialog
      .getByRole('textbox', { name: 'Review note' })
      .fill('Browser smoke is returning the reopened workflow to pending.');
    await exceptionDialog
      .getByRole('button', { name: 'Return to pending' })
      .click();
    await exceptionDialog.waitFor({ state: 'hidden' });
  }

  private async verifyMatchedPairs() {
    const transactionView = this.page.getByRole('combobox', {
      name: 'Workflow view',
    });
    await transactionView.click();
    await this.page
      .getByRole('option', { name: 'Matched reversal pairs' })
      .click();
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        new URLSearchParams(search).get('tab') === 'transactions' &&
        new URLSearchParams(search).get('view') === 'matched-reversal-pairs',
      'Transaction workflow filter did not show approved reversal pairs'
    );

    const matchedBadge = this.page
      .getByRole('button', { name: 'Matched original' })
      .first();
    await matchedBadge.waitFor({ state: 'visible' });
    await matchedBadge.click();
    const pairDialog = this.page.getByRole('dialog', {
      name: 'Reversal pair',
    });
    await pairDialog.waitFor({ state: 'visible' });
    await pairDialog
      .getByText('Reversal transaction', { exact: true })
      .waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
  }

  private async verifyReversalReviewQueue() {
    await this.emit('Reviewing generated reversal pairs as a queue');
    const transactionUrl = `/api/projects/${this.fixtures.projectId}/transactions`;
    const pairs: ReversalPair[] = [
      {
        suffix: 'a',
        sourceDate: '2026-05-30',
        counterpartDate: '2026-06-29',
        sourceItem: 'Browser smoke accrual A',
        counterpartItem: 'Browser smoke reversal A',
        amountCents: 12_345,
      },
      {
        suffix: 'b',
        sourceDate: '2026-05-31',
        counterpartDate: '2026-06-30',
        sourceItem: 'Browser smoke accrual B',
        counterpartItem: 'Browser smoke reversal B',
        amountCents: 23_456,
      },
    ];
    const reversalFixtures = this.buildReversalFixtures(pairs);

    await this.createTransactions(
      transactionUrl,
      reversalFixtures.map(({ source }) => source)
    );
    await this.gotoProject('tab=transactions');
    await this.page.getByText(/^2 transactions$/).waitFor({ state: 'visible' });
    await this.markPending(pairs);

    await this.createTransactions(
      transactionUrl,
      reversalFixtures.map(({ counterpart }) => counterpart)
    );
    await this.gotoProject('tab=transactions');
    await this.page.getByText(/^4 transactions$/).waitFor({ state: 'visible' });
    await this.page.getByRole('button', { name: 'Tools' }).click();
    await this.page
      .getByRole('menuitem', { name: 'Find reversal matches' })
      .click();
    await this.page
      .getByText('Reversal matches found', { exact: true })
      .waitFor({ state: 'visible' });

    await this.verifyTransactionSearch(transactionUrl);
    await this.openReviewQueueFromCompany();
    await this.reviewAndApprovePairs();
    await this.verifyMatchedPairs();
  }

  private async verifyTransactionSearch(transactionUrl: string) {
    const transactionSearch = this.page.getByRole('textbox', {
      name: 'Search transactions',
    });
    const filteredTransactionsResponse = this.page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === transactionUrl &&
          url.searchParams.get('mode') === 'page' &&
          url.searchParams.get('search') === 'Browser smoke reversal A'
        );
      }
    );
    await transactionSearch.fill('Browser smoke reversal A');
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        new URLSearchParams(search).get('q') === 'Browser smoke reversal A',
      'Transaction search did not update the workspace URL'
    );
    const filteredTransactions = (await (
      await filteredTransactionsResponse
    ).json()) as {
      rows?: unknown[];
      summary?: { totalCount?: number };
    };
    this.assert(
      filteredTransactions.rows?.length === 1 &&
        filteredTransactions.summary?.totalCount === 1,
      `Transaction search returned ${String(filteredTransactions.summary?.totalCount)} total rows and ${String(filteredTransactions.rows?.length)} page rows`
    );
    await this.page.getByText(/^1 transaction$/).waitFor({ state: 'visible' });
    this.assert(
      await transactionSearch.evaluate(
        (element) => document.activeElement === element
      ),
      'Transaction search lost focus while applying server results'
    );
    await this.page
      .getByRole('button', { name: 'Clear transaction search' })
      .click();
    await this.waitForLocation(
      ({ pathname, search }) =>
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        !new URLSearchParams(search).has('q'),
      'Clearing transaction search did not update the workspace URL'
    );
    await this.page.getByText(/^4 transactions$/).waitFor({ state: 'visible' });
  }

  private async openReviewQueueFromCompany() {
    await this.emit(
      'Opening a reversal decision from the company project list'
    );
    await this.gotoCompany('tab=summary');
    const reversalDecisionLink = this.page.getByRole('link', {
      name: '2 reversal decisions',
    });
    await reversalDecisionLink.waitFor({ state: 'visible' });
    await reversalDecisionLink.click();
    await this.waitForLocation(({ pathname, search }) => {
      const params = new URLSearchParams(search);
      return (
        pathname ===
          `/c/${this.fixtures.companyId}/p/${this.fixtures.projectId}` &&
        params.get('tab') === 'transactions' &&
        params.get('view') === 'reversal-review' &&
        params.get('source') === 'company-work-queue'
      );
    }, 'Company project list did not open the reversal decision workflow');
    await this.page
      .getByText(
        'Opened from the company project list to resolve outstanding work.',
        { exact: true }
      )
      .waitFor({ state: 'visible' });
  }

  private async reviewAndApprovePairs() {
    const reviewQueueButton = this.page.getByRole('button', {
      name: 'Review matches (2)',
    });
    await reviewQueueButton.waitFor({ state: 'visible' });
    await reviewQueueButton.click();
    const reviewDialog = this.page.getByRole('dialog', {
      name: 'Review reversal match',
    });
    await reviewDialog.waitFor({ state: 'visible' });
    await reviewDialog
      .getByText('Match 1 of 2', { exact: true })
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByText('Original transaction', { exact: true })
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByText('Reversal transaction', { exact: true })
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByText('Browser smoke accrual B', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByText('Browser smoke reversal B', { exact: true })
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByText('Match evidence', { exact: true })
      .waitFor({ state: 'visible' });

    const reviewModalBody = reviewDialog.locator('.mantine-Modal-body');
    const initialScroll = await reviewModalBody.evaluate<
      { clientHeight: number; scrollHeight: number; scrollTop: number },
      HTMLElement
    >((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    this.assert(
      initialScroll.scrollHeight > initialScroll.clientHeight,
      'Reversal review modal did not create an internal scroll region'
    );
    await reviewModalBody.hover();
    await this.page.mouse.wheel(0, 500);
    await this.page.waitForTimeout(100);
    const scrolledTop = await reviewModalBody.evaluate<number, HTMLElement>(
      (element) => element.scrollTop
    );
    this.assert(
      scrolledTop > initialScroll.scrollTop,
      'Reversal review modal did not respond to wheel scrolling'
    );
    await reviewModalBody.evaluate((element) => {
      element.scrollTop = 0;
    });

    await reviewDialog
      .getByRole('button', { name: 'Next', exact: true })
      .click();
    await reviewDialog
      .getByText('Browser smoke accrual A', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    await reviewDialog.getByRole('button', { name: 'Previous' }).click();
    await reviewDialog
      .getByText('Browser smoke accrual B', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByRole('button', { name: 'Next', exact: true })
      .click();
    await reviewDialog
      .getByText('Browser smoke accrual A', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByRole('button', { name: 'Approve and next' })
      .click();
    await reviewDialog
      .getByText('Browser smoke accrual B', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    await reviewDialog
      .getByRole('button', { name: 'Approve and finish' })
      .click();
    await reviewDialog.waitFor({ state: 'hidden' });
    await this.page
      .getByText('Reversal review complete', { exact: true })
      .waitFor({ state: 'visible' });
  }
}
