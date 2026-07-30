// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import TransactionCommentsModal from '../src/components/TransactionCommentsModal';
import type { Txn, TxnComment } from '../src/types';
import {
  asCompanyId,
  asProjectId,
  asTxnCommentId,
  asTxnId,
  asUserId,
} from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

const queryMocks = vi.hoisted(() => ({
  comments: [] as unknown[],
  memberships: [] as unknown[],
  users: [] as unknown[],
  createComment: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  updateComment: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock('../src/queries/transactionComments', () => ({
  useTransactionCommentsQuery: () => ({
    data: queryMocks.comments,
    isLoading: false,
  }),
  useCreateTransactionCommentMutation: () => queryMocks.createComment,
  useUpdateTransactionCommentMutation: () => queryMocks.updateComment,
}));

vi.mock('../src/queries/memberships', () => ({
  useProjectMembershipsQuery: () => ({
    data: queryMocks.memberships,
  }),
}));

vi.mock('../src/queries/reference', () => ({
  useUsersQuery: () => ({
    data: queryMocks.users,
  }),
}));

beforeAll(() => {
  installComponentTestDom();
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
});

afterEach(() => {
  cleanup();
  queryMocks.comments = [];
  queryMocks.memberships = [];
  queryMocks.users = [];
  queryMocks.createComment.isPending = false;
  queryMocks.createComment.mutateAsync.mockReset();
  queryMocks.updateComment.isPending = false;
  queryMocks.updateComment.mutateAsync.mockReset();
});

const companyId = asCompanyId('company-comments');
const projectId = asProjectId('project-comments');
const txnId = asTxnId('txn-comments');
const authorId = asUserId('user-author');
const memberId = asUserId('user-member');

function createTxn(): Txn {
  return {
    id: txnId,
    companyId,
    projectId,
    date: '2026-07-30',
    item: 'Supplier invoice',
    description: 'Transaction comment test',
    amountCents: 25_000,
    txnType: 'standard',
    budgetImpact: true,
    categorisable: true,
  };
}

function createComment(): TxnComment {
  return {
    id: asTxnCommentId('comment-parent'),
    companyId,
    projectId,
    txnId,
    body: 'Please confirm the allocation.',
    createdByUserId: authorId,
    createdByName: 'Alex Author',
    createdAt: '2026-07-30T02:00:00.000Z',
    updatedAt: '2026-07-30T02:00:00.000Z',
  };
}

describe('TransactionCommentsModal', () => {
  it('preserves a failed comment draft so the user can retry it', async () => {
    queryMocks.createComment.mutateAsync
      .mockRejectedValueOnce(new Error('Comment service unavailable'))
      .mockResolvedValueOnce(createComment());
    renderComponent(
      <TransactionCommentsModal opened txn={createTxn()} onClose={vi.fn()} />
    );

    const composer = screen.getByLabelText('New comment');
    fireEvent.change(composer, {
      target: { value: 'Keep this draft after the failure.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Comment service unavailable'
    );
    expect((composer as HTMLTextAreaElement).value).toBe(
      'Keep this draft after the failure.'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
    await waitFor(() =>
      expect((composer as HTMLTextAreaElement).value).toBe('')
    );
    expect(queryMocks.createComment.mutateAsync).toHaveBeenCalledTimes(2);
    expect(queryMocks.createComment.mutateAsync).toHaveBeenNthCalledWith(2, {
      txnId,
      body: 'Keep this draft after the failure.',
      parentCommentId: undefined,
      assignedToUserId: null,
    });
  });

  it('creates a reply and limits mention assignment to project members', async () => {
    const parent = createComment();
    queryMocks.comments = [parent];
    queryMocks.memberships = [
      {
        companyId,
        projectId,
        userId: memberId,
        role: 'member',
      },
    ];
    queryMocks.users = [
      {
        id: memberId,
        name: 'Morgan Member',
        email: 'morgan@example.com',
        disabled: false,
      },
      {
        id: asUserId('user-outsider'),
        name: 'Olivia Outsider',
        email: 'olivia@example.com',
        disabled: false,
      },
    ];
    queryMocks.createComment.mutateAsync.mockResolvedValue(parent);
    renderComponent(
      <TransactionCommentsModal opened txn={createTxn()} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const composer = screen.getByLabelText('Reply');
    fireEvent.change(composer, {
      target: {
        value: '@Mor',
        selectionStart: 4,
      },
    });

    expect(screen.getByRole('option', { name: /Morgan Member/ })).toBeTruthy();
    expect(
      screen.queryByRole('option', { name: /Olivia Outsider/ })
    ).toBeNull();
    fireEvent.mouseDown(screen.getByRole('option', { name: /Morgan Member/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reply' }));

    await waitFor(() =>
      expect(queryMocks.createComment.mutateAsync).toHaveBeenCalledWith({
        txnId,
        body: '@Morgan Member ',
        parentCommentId: parent.id,
        assignedToUserId: memberId,
      })
    );
  });
});
