import {
  keepPreviousData,
  queryOptions,
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
import { apiErrorFromBody } from '../api/errorResponses';
import {
  createTransactionCommentServerFn,
  listTransactionCommentsServerFn,
  updateTransactionCommentServerFn,
} from '../server/start/functions/transactionReads';
import {
  readJsonResponseOrNull,
  readJsonResponseWithSchema,
} from '../utils/json';
import { txnCommentSummariesResponseSchema } from '../validation/transactionResponseSchemas';

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

export function transactionCommentSummariesQueryOptions(
  userId: string,
  projectId: ProjectId,
  input: TxnCommentSummariesInput,
  options: { enabled?: boolean } = {}
) {
  return queryOptions({
    queryKey: qk.transactionCommentSummaries(
      userId,
      projectId,
      txnIdsKey(input.txnIds)
    ),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      for (const txnId of [...(input.txnIds ?? [])].sort()) {
        params.append('txnId', txnId);
      }
      const query = params.size > 0 ? `?${params.toString()}` : '';
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/transactions/comment-summaries${query}`,
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          signal,
        }
      );
      if (!response.ok) {
        throw apiErrorFromBody(
          await readJsonResponseOrNull(response),
          'Could not load transaction comment summaries.'
        );
      }
      const payload = await readJsonResponseWithSchema(
        response,
        txnCommentSummariesResponseSchema
      );
      if (!payload.success) {
        throw apiErrorFromBody(
          null,
          'Transaction comment summaries response was not valid JSON'
        );
      }
      return payload.data;
    },
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    retry: false,
  });
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
