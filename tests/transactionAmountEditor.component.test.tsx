// @vitest-environment jsdom

import type { ReactElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTransactionColumns } from '../src/components/transactions/transactionTableColumns';
import type { TransactionActions } from '../src/hooks/useTransactionActions';
import type { TaxonomyHook } from '../src/hooks/useTaxonomy';
import type { Txn } from '../src/types';
import { asCompanyId, asProjectId, asTxnId } from '../src/types/ids';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

const transaction: Txn = {
  id: asTxnId('txn_amount_editor'),
  companyId: asCompanyId('co_amount_editor'),
  projectId: asProjectId('prj_amount_editor'),
  date: '2026-07-29',
  item: 'Transaction amount test',
  description: 'Editor test',
  amountCents: 1_000,
  txnType: 'standard',
  budgetImpact: true,
  categorisable: true,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderAmountEditor(updateTxn: TransactionActions['updateTxn']) {
  const columns = createTransactionColumns({
    transactionActions: { updateTxn } as TransactionActions,
    taxonomy: {
      categoryOptions: [],
      subCategoryOptions: [],
      validSubIds: new Set(),
    } as unknown as TaxonomyHook,
    currencyCode: 'AUD',
    readOnly: false,
    commentSummaryByTxnId: new Map(),
    expandedCommentsTxn: null,
    expandedComments: [],
    expandedCommentsLoading: false,
    transferOutEnabled: false,
    transferProjectOptions: [],
    canManageReversals: false,
    canResolveUnlock: false,
    onApplyProjectRulePrompt: vi.fn(),
    onProjectRuleError: vi.fn(),
    onOpenComments: vi.fn(),
    onToggleExpandedComments: vi.fn(),
    onOpenReversal: vi.fn(),
    onOpenSplit: vi.fn(),
    onOpenTransfer: vi.fn(),
    onOpenUnlock: vi.fn(),
  });
  const amountColumn = columns.find(
    (column) => column.accessorKey === 'amountCents'
  );
  if (!amountColumn?.Edit) {
    throw new Error('Transaction amount editor column is missing');
  }
  const setEditingCell = vi.fn();
  const Edit = amountColumn.Edit as unknown as (props: {
    row: { original: Txn };
    table: { setEditingCell: (cell: null) => void };
  }) => ReactElement;

  renderComponent(
    <Edit row={{ original: transaction }} table={{ setEditingCell }} />
  );
  return { setEditingCell };
}

describe('transaction amount editing', () => {
  it('waits for explicit persistence before closing the table editor', async () => {
    const save = deferred();
    const updateTxn = vi.fn(
      () => save.promise
    ) as unknown as TransactionActions['updateTxn'];
    const { setEditingCell } = renderAmountEditor(updateTxn);
    const input = screen.getByRole('textbox', {
      name: 'Amount for Transaction amount test',
    });

    fireEvent.change(input, { target: { value: '20.00' } });
    expect(updateTxn).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save amount for Transaction amount test',
      })
    );
    expect(updateTxn).toHaveBeenCalledWith(transaction.id, {
      amountCents: 2_000,
    });
    expect(setEditingCell).not.toHaveBeenCalled();

    save.resolve();
    await waitFor(() => expect(setEditingCell).toHaveBeenCalledWith(null));
  });

  it('keeps the table editor open when persistence is rejected', async () => {
    const updateTxn = vi
      .fn()
      .mockRejectedValue(
        new Error('Transaction update failed')
      ) as unknown as TransactionActions['updateTxn'];
    const { setEditingCell } = renderAmountEditor(updateTxn);
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Amount for Transaction amount test',
      }),
      { target: { value: '25.00' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save amount for Transaction amount test',
      })
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Transaction update failed'
    );
    expect(setEditingCell).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', {
        name: 'Amount for Transaction amount test',
      })
    ).toBeTruthy();
  });
});
