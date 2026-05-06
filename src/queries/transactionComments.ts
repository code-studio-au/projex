import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, TxnCommentId, TxnId } from '../types';
import type {
  TxnCommentCreateInput,
  TxnCommentUpdateInput,
} from '../api/contract';

export function useTransactionCommentsQuery(
  projectId: ProjectId,
  txnId: TxnId,
  options: { enabled?: boolean } = {}
) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.transactionComments(scopeUserId, projectId, txnId),
    queryFn: () => api.listTransactionComments(projectId, txnId),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useCreateTransactionCommentMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCommentCreateInput) =>
      api.createTransactionComment(projectId, input),
    onSuccess: async (_comment, input) => {
      await qc.invalidateQueries({
        queryKey: qk.transactionComments(scopeUserId, projectId, input.txnId),
      });
    },
  });
}

export function useUpdateTransactionCommentMutation(
  projectId: ProjectId,
  txnId: TxnId
) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCommentUpdateInput) =>
      api.updateTransactionComment(projectId, txnId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: qk.transactionComments(scopeUserId, projectId, txnId),
      });
    },
  });
}

export function useDeleteTransactionCommentMutation(
  projectId: ProjectId,
  txnId: TxnId
) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (commentId: TxnCommentId) =>
      api.deleteTransactionComment(projectId, txnId, commentId),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: qk.transactionComments(scopeUserId, projectId, txnId),
      });
    },
  });
}
