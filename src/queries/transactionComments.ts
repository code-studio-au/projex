import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, TxnCommentId, TxnId } from '../types';
import type {
  TxnCommentCreateInput,
  TxnCommentUpdateInput,
} from '../api/contract';
import {
  createTransactionCommentServerFn,
  deleteTransactionCommentServerFn,
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
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(
    transactionCommentSummariesQueryOptions(scopeUserId, projectId, options)
  );
}

export function transactionCommentSummariesQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.transactionCommentSummaries(userId, projectId),
    queryFn: () =>
      listTransactionCommentSummariesServerFn({ data: { projectId } }),
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
          queryKey: qk.transactionCommentSummaries(scopeUserId, projectId),
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
          queryKey: qk.transactionCommentSummaries(scopeUserId, projectId),
        }),
      ]);
    },
  });
}

export function useDeleteTransactionCommentMutation(
  projectId: ProjectId,
  txnId: TxnId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (commentId: TxnCommentId) =>
      deleteTransactionCommentServerFn({
        data: { projectId, txnId, commentId },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactionComments(scopeUserId, projectId, txnId),
        }),
        qc.invalidateQueries({
          queryKey: qk.transactionCommentSummaries(scopeUserId, projectId),
        }),
      ]);
    },
  });
}
