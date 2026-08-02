// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import TransactionReversalModal from '../src/components/transactions/TransactionReversalModal';
import { qk } from '../src/queries/keys';
import type { Txn } from '../src/types';
import { asCompanyId, asProjectId, asTxnId } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function createTxn(): Txn {
  return {
    id: asTxnId('txn-component-test'),
    companyId: asCompanyId('company-component-test'),
    projectId: asProjectId('project-component-test'),
    date: '2026-07-28',
    item: 'Supplier refund',
    description: 'Component test transaction',
    amountCents: -12_500,
    txnType: 'standard',
    budgetImpact: true,
    categorisable: true,
  };
}

function renderModal(element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(qk.session(), { userId: 'user-component-test' });
  return renderComponent(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
  );
}

describe('TransactionReversalModal', () => {
  it('requires a comment before marking a transaction pending', async () => {
    const onSubmitAction = vi.fn().mockResolvedValue({});
    renderModal(
      <TransactionReversalModal
        opened
        txn={createTxn()}
        currencyCode="AUD"
        expectedProjectOptions={[]}
        canManage
        onClose={vi.fn()}
        onSubmitAction={onSubmitAction}
      />
    );

    const submit = screen.getByRole('button', {
      name: 'Mark pending reversal',
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'Refund is expected next month.' },
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() =>
      expect(onSubmitAction).toHaveBeenCalledWith({
        action: 'markPending',
        txnId: asTxnId('txn-component-test'),
        commentBody: 'Refund is expected next month.',
        expectedProjectId: undefined,
        expectedReversalVersion: undefined,
      })
    );
  });

  it('keeps reversal controls read-only when permission is absent', () => {
    const txn = createTxn();
    txn.reversal = {
      id: 'reversal-component-test',
      status: 'pending_reversal',
      side: 'source',
      version: 3,
    };

    renderModal(
      <TransactionReversalModal
        opened
        txn={txn}
        currencyCode="AUD"
        expectedProjectOptions={[]}
        canManage={false}
        onClose={vi.fn()}
        onSubmitAction={vi.fn()}
      />
    );

    expect(
      screen.getByText(/This reversal workflow is read-only/)
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark exception' })).toBeNull();
  });
});
