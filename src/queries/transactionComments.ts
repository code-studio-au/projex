import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, TxnId } from '../types';
import type {
  TxnCommentCreateInput,
  TxnCommentSummariesInput,
  TxnCommentUpdateInput,
} from '../api/types';
import {
  createTransactionCommentServerFn,
  listTransactionCommentSummariesServerFn,
  listTransactionCommentsServerFn,
  updateTransactionCommentServerFn,
} from '../server/start/functions/transactionReads';

export function useTransactionCommentsQuery(
  projectId: ProjectId,
  txnId: TxnId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.transactionComments(scopeUserId, projectId, txnId),
    queryFn: () =>
      listTransactionCommentsServerFn({ data: { projectId, txnId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useTransactionCommentSummariesQuery(
  projectId: ProjectId,
  input: TxnCommentSummariesInput,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(
    transactionCommentSummariesQueryOptions(
      scopeUserId,
      projectId,
      input,
      options
    )
  );
}

function txnIdsKey(txnIds?: TxnId[]) {
  return txnIds?.length ? [...txnIds].sort().join(',') : 'all';
}

function transactionCommentSummariesQueryOptions(
  userId: string,
  projectId: ProjectId,
  input: TxnCommentSummariesInput,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.transactionCommentSummaries(
      userId,
      projectId,
      txnIdsKey(input.txnIds)
    ),
    queryFn: () =>
      listTransactionCommentSummariesServerFn({
        data: { projectId, payload: input },
      }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useCreateTransactionCommentMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCommentCreateInput) =>
      createTransactionCommentServerFn({ data: { projectId, payload: input } }),
    onSuccess: async (_comment, input) => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactionComments(scopeUserId, projectId, input.txnId),
        }),
        qc.invalidateQueries({
          queryKey: ['transactionCommentSummaries', scopeUserId, projectId],
          exact: false,
        }),
      ]);
    },
  });
}

export function useUpdateTransactionCommentMutation(
  projectId: ProjectId,
  txnId: TxnId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCommentUpdateInput) =>
      updateTransactionCommentServerFn({
        data: { projectId, txnId, payload: input },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactionComments(scopeUserId, projectId, txnId),
        }),
        qc.invalidateQueries({
          queryKey: ['transactionCommentSummaries', scopeUserId, projectId],
          exact: false,
        }),
      ]);
    },
  });
}
